DROP TABLE IF EXISTS "case";
--> statement-breakpoint
ALTER TABLE "realtime_outbox" ADD COLUMN "userId" text;--> statement-breakpoint
ALTER TABLE "submission_requests" ADD COLUMN "id" uuid DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "submission_requests" ADD COLUMN "userId" text;--> statement-breakpoint
ALTER TABLE "test_cases" ADD COLUMN "userId" text;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "userId" text;--> statement-breakpoint
ALTER TABLE "submission_requests" DROP CONSTRAINT "submission_requests_pkey";--> statement-breakpoint
ALTER TABLE "submission_requests" ADD PRIMARY KEY ("id");--> statement-breakpoint
CREATE INDEX "realtime_outbox_user_summary_idx" ON "realtime_outbox" ("userId","id") WHERE "summary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "submission_requests_user_key_idx" ON "submission_requests" ("userId","key");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_requests_legacy_key_idx" ON "submission_requests" ("key") WHERE "userId" is null;--> statement-breakpoint
CREATE INDEX "test_cases_user_updated_idx" ON "test_cases" ("userId","updatedAt","id");--> statement-breakpoint
CREATE INDEX "test_runs_user_started_idx" ON "test_runs" ("userId","startedAt","id");--> statement-breakpoint
ALTER TABLE "realtime_outbox" ADD CONSTRAINT "realtime_outbox_userId_auth_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id");--> statement-breakpoint
ALTER TABLE "submission_requests" ADD CONSTRAINT "submission_requests_userId_auth_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id");--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_userId_auth_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id");--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_userId_auth_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id");
--> statement-breakpoint
-- Persist ownership with notifications, including case deletion events.
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
      summary_changed := (row_data - ARRAY['heartbeatAt', 'leaseUntil', 'realtimeRevision', 'plan', 'events', 'browserLogs', 'environmentSnapshot', 'capabilities', 'evidenceComplete'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['heartbeatAt', 'leaseUntil', 'realtimeRevision', 'plan', 'events', 'browserLogs', 'environmentSnapshot', 'capabilities', 'evidenceComplete']);
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
      WHEN 'run_artifacts' THEN 'artifact' ELSE 'log' END;
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
