-- Stop API and worker writers before migration, then deploy the matching application.
-- Event sequences already count across attempts; enforce that ordering at the database boundary.
DROP INDEX "automation_event_sequence_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "automation_event_sequence_unique" ON "automation_run_events" ("runId","sequence");
--> statement-breakpoint
ALTER TABLE "automation_run_events" ADD CONSTRAINT "automation_event_sequence_check" CHECK ("sequence" > 0);
--> statement-breakpoint
-- Do not discard either representation if existing messages disagree.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "test_runs" AS run
    CROSS JOIN LATERAL jsonb_array_elements(run.events) WITH ORDINALITY AS entry(data, ordinal)
    JOIN "automation_run_events" AS event
      ON event."runId" = run.id AND event.sequence = entry.ordinal
    WHERE event.message IS DISTINCT FROM entry.data->>'message'
  ) THEN
    RAISE EXCEPTION 'Legacy run events conflict with stored events; source column retained';
  END IF;
END;
$$;
--> statement-breakpoint
-- The JSON copy carries the timestamp exposed by the old API; keep it for matched events.
-- Existing attempt/ID values remain intact. JSON-only events use the run's recorded attempt.
UPDATE "automation_run_events" AS event
SET at = (entry.data->>'at')::timestamptz
FROM "test_runs" AS run,
LATERAL jsonb_array_elements(run.events) WITH ORDINALITY AS entry(data, ordinal)
WHERE event."runId" = run.id AND event.sequence = entry.ordinal;
--> statement-breakpoint
INSERT INTO "automation_run_events" ("runId", attempt, sequence, at, message)
SELECT run.id, run.attempt, entry.ordinal::integer,
       (entry.data->>'at')::timestamptz, entry.data->>'message'
FROM "test_runs" AS run,
LATERAL jsonb_array_elements(run.events) WITH ORDINALITY AS entry(data, ordinal)
ORDER BY run.id, entry.ordinal
ON CONFLICT ("runId", sequence) DO NOTHING;
--> statement-breakpoint
ALTER TABLE "test_runs" DROP COLUMN "events";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION testdog_realtime_event() RETURNS trigger LANGUAGE plpgsql AS $$
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
      (row_data - ARRAY['heartbeatAt', 'leaseUntil', 'realtimeRevision']) IS NOT DISTINCT FROM
      (to_jsonb(OLD) - ARRAY['heartbeatAt', 'leaseUntil', 'realtimeRevision']) THEN
      RETURN NEW;
    END IF;
    run_id := NEW.id;
    owner_id := NEW."userId";
    rev := NEW."realtimeRevision";
    event_kind := 'run';
    IF TG_OP = 'INSERT' THEN
      summary_changed := true;
    ELSE
      summary_changed := (row_data - ARRAY['heartbeatAt', 'leaseUntil', 'realtimeRevision', 'plan', 'environmentSnapshot', 'capabilities', 'evidenceComplete'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['heartbeatAt', 'leaseUntil', 'realtimeRevision', 'plan', 'environmentSnapshot', 'capabilities', 'evidenceComplete']);
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

--> statement-breakpoint
CREATE TRIGGER testdog_execution_event AFTER INSERT ON automation_run_events
FOR EACH ROW EXECUTE FUNCTION testdog_realtime_event();
