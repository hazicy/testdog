CREATE TABLE "run_detail_versions" (
	"runId" uuid PRIMARY KEY,
	"version" uuid DEFAULT gen_random_uuid() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_detail_versions" ADD CONSTRAINT "run_detail_versions_runId_test_runs_id_fkey" FOREIGN KEY ("runId") REFERENCES "test_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE FUNCTION testdog_detail_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'test_runs' THEN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO run_detail_versions ("runId") VALUES (NEW.id);
    ELSIF (to_jsonb(NEW) - 'leaseUntil') IS DISTINCT FROM (to_jsonb(OLD) - 'leaseUntil') THEN
      UPDATE run_detail_versions SET version = gen_random_uuid() WHERE "runId" = NEW.id;
    END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN
      UPDATE run_detail_versions SET version = gen_random_uuid() WHERE "runId" = OLD."runId";
    END IF;
    IF TG_OP <> 'DELETE' THEN
      UPDATE run_detail_versions SET version = gen_random_uuid() WHERE "runId" = NEW."runId";
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER testdog_detail_version AFTER INSERT OR UPDATE ON test_runs
FOR EACH ROW EXECUTE FUNCTION testdog_detail_version();
--> statement-breakpoint
CREATE TRIGGER testdog_step_detail_version AFTER INSERT OR UPDATE OR DELETE ON run_steps
FOR EACH ROW EXECUTE FUNCTION testdog_detail_version();
--> statement-breakpoint
CREATE TRIGGER testdog_artifact_detail_version AFTER INSERT OR UPDATE OR DELETE ON run_artifacts
FOR EACH ROW EXECUTE FUNCTION testdog_detail_version();
--> statement-breakpoint
CREATE TRIGGER testdog_event_detail_version AFTER INSERT OR UPDATE OR DELETE ON automation_run_events
FOR EACH ROW EXECUTE FUNCTION testdog_detail_version();
--> statement-breakpoint
-- Install triggers before backfilling so concurrent inserts cannot miss their version.
INSERT INTO run_detail_versions ("runId") SELECT id FROM test_runs ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION testdog_delivery_ready() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'pending' AND (TG_OP = 'INSERT' OR
    (NEW.status, NEW."nextAttemptAt") IS DISTINCT FROM (OLD.status, OLD."nextAttemptAt")) THEN
    INSERT INTO realtime_outbox(kind, data) VALUES ('notification', '{}');
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER testdog_delivery_ready AFTER INSERT OR UPDATE ON notification_deliveries
FOR EACH ROW EXECUTE FUNCTION testdog_delivery_ready();
