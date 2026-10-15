CREATE TABLE "realtime_outbox" (
	"id" bigserial PRIMARY KEY,
	"runId" uuid,
	"revision" integer,
	"kind" text NOT NULL,
	"data" jsonb NOT NULL,
	"summary" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"publishedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "realtimeRevision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "realtime_outbox_run_revision_idx" ON "realtime_outbox" ("runId","revision");--> statement-breakpoint
CREATE INDEX "realtime_outbox_pending_idx" ON "realtime_outbox" ("id") WHERE "publishedAt" is null;--> statement-breakpoint
ALTER TABLE "realtime_outbox" ADD CONSTRAINT "realtime_outbox_runId_test_runs_id_fkey" FOREIGN KEY ("runId") REFERENCES "test_runs"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- Heartbeats and internal revision bumps do not generate user-visible events.
CREATE FUNCTION testdog_run_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."realtimeRevision" := 1;
  ELSIF (to_jsonb(NEW) - ARRAY['heartbeatAt', 'leaseUntil', 'realtimeRevision'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['heartbeatAt', 'leaseUntil', 'realtimeRevision']) THEN
    NEW."realtimeRevision" := OLD."realtimeRevision" + 1;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER testdog_run_revision BEFORE INSERT OR UPDATE ON test_runs
FOR EACH ROW EXECUTE FUNCTION testdog_run_revision();
--> statement-breakpoint
CREATE FUNCTION testdog_realtime_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_data jsonb;
  run_id uuid;
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
    rev := NEW."realtimeRevision";
    event_kind := 'run';
    IF TG_OP = 'INSERT' THEN
      summary_changed := true;
    ELSE
      summary_changed := (row_data - ARRAY['heartbeatAt', 'leaseUntil', 'realtimeRevision', 'plan', 'events', 'browserLogs', 'environmentSnapshot', 'capabilities', 'evidenceComplete'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['heartbeatAt', 'leaseUntil', 'realtimeRevision', 'plan', 'events', 'browserLogs', 'environmentSnapshot', 'capabilities', 'evidenceComplete']);
    END IF;
  ELSIF TG_TABLE_NAME = 'test_cases' THEN
    INSERT INTO realtime_outbox(kind, data, summary) VALUES ('tests', '{}', true);
    RETURN NULL;
  ELSE
    run_id := NEW."runId";
    UPDATE test_runs SET "realtimeRevision" = "realtimeRevision" + 1
      WHERE id = run_id RETURNING "realtimeRevision" INTO rev;
    event_kind := CASE TG_TABLE_NAME WHEN 'run_steps' THEN 'step'
      WHEN 'run_artifacts' THEN 'artifact' ELSE 'log' END;
    row_data := row_data - 'path';
  END IF;
  INSERT INTO realtime_outbox("runId", revision, kind, data, summary)
    VALUES (run_id, rev, event_kind, row_data, summary_changed);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER testdog_run_event AFTER INSERT OR UPDATE ON test_runs
FOR EACH ROW EXECUTE FUNCTION testdog_realtime_event();
--> statement-breakpoint
CREATE TRIGGER testdog_step_event AFTER INSERT OR UPDATE ON run_steps
FOR EACH ROW EXECUTE FUNCTION testdog_realtime_event();
--> statement-breakpoint
CREATE TRIGGER testdog_artifact_event AFTER INSERT ON run_artifacts
FOR EACH ROW EXECUTE FUNCTION testdog_realtime_event();
--> statement-breakpoint
CREATE TRIGGER testdog_log_event AFTER INSERT ON run_browser_logs
FOR EACH ROW EXECUTE FUNCTION testdog_realtime_event();
--> statement-breakpoint
CREATE TRIGGER testdog_test_event AFTER INSERT OR UPDATE OR DELETE ON test_cases
FOR EACH ROW EXECUTE FUNCTION testdog_realtime_event();
