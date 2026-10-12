-- Stop API and worker writers before migration; deploy the matching application before restarting.
DROP TABLE "automation_workers";--> statement-breakpoint
ALTER TABLE "test_runs" DROP COLUMN "preparingAt";--> statement-breakpoint
ALTER TABLE "test_runs" DROP COLUMN "executingAt";--> statement-breakpoint
ALTER TABLE "test_runs" DROP COLUMN "finalizingAt";--> statement-breakpoint
ALTER TABLE "test_runs" DROP COLUMN "heartbeatAt";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION caseforge_run_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."realtimeRevision" := 1;
  ELSIF (to_jsonb(NEW) - ARRAY['leaseUntil', 'realtimeRevision'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['leaseUntil', 'realtimeRevision']) THEN
    NEW."realtimeRevision" := OLD."realtimeRevision" + 1;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION caseforge_realtime_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_data jsonb;
  run_id uuid;
  owner_id text;
  rev integer;
  event_kind text;
  summary_changed boolean := false;
BEGIN
  row_data := to_jsonb(NEW);
  IF TG_TABLE_NAME = 'test_runs' THEN
    IF TG_OP = 'UPDATE' AND
      (row_data - ARRAY['leaseUntil', 'realtimeRevision']) IS NOT DISTINCT FROM
      (to_jsonb(OLD) - ARRAY['leaseUntil', 'realtimeRevision']) THEN
      RETURN NEW;
    END IF;
    run_id := NEW.id;
    owner_id := NEW."userId";
    rev := NEW."realtimeRevision";
    event_kind := 'run';
    IF TG_OP = 'INSERT' THEN
      summary_changed := true;
    ELSE
      summary_changed := (row_data - ARRAY['leaseUntil', 'realtimeRevision', 'plan', 'environmentSnapshot', 'capabilities', 'evidenceComplete'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['leaseUntil', 'realtimeRevision', 'plan', 'environmentSnapshot', 'capabilities', 'evidenceComplete']);
    END IF;
  ELSIF TG_TABLE_NAME = 'test_cases' THEN
    owner_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."userId" ELSE NEW."userId" END;
    INSERT INTO realtime_outbox("userId", kind, data, summary) VALUES (owner_id, 'tests', '{}', true);
    IF TG_OP = 'UPDATE' AND OLD."userId" IS DISTINCT FROM NEW."userId" THEN
      INSERT INTO realtime_outbox("userId", kind, data, summary) VALUES (OLD."userId", 'tests', '{}', true);
    END IF;
    RETURN NULL;
  ELSE
    run_id := NEW."runId";
    SELECT "userId" INTO owner_id FROM test_runs WHERE id = run_id;
    UPDATE test_runs SET "realtimeRevision" = "realtimeRevision" + 1
      WHERE id = run_id RETURNING "realtimeRevision" INTO rev;
    event_kind := CASE TG_TABLE_NAME WHEN 'run_steps' THEN 'step'
      WHEN 'run_artifacts' THEN 'artifact'
      WHEN 'automation_run_events' THEN 'event' ELSE 'log' END;
    row_data := row_data - 'path';
  END IF;
  INSERT INTO realtime_outbox("userId", "runId", revision, kind, data, summary)
    VALUES (owner_id, run_id, rev, event_kind, row_data, summary_changed);
  IF TG_TABLE_NAME = 'test_runs' AND TG_OP = 'UPDATE' THEN
    IF OLD."userId" IS DISTINCT FROM NEW."userId" THEN
      INSERT INTO realtime_outbox("userId", kind, data, summary) VALUES (OLD."userId", 'tests', '{}', true);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
