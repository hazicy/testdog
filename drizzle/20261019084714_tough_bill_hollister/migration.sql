ALTER TABLE "realtime_outbox" ADD COLUMN "claimToken" uuid;--> statement-breakpoint
ALTER TABLE "realtime_outbox" ADD COLUMN "claimUntil" timestamp with time zone;--> statement-breakpoint
-- Model changes participate in the existing ordered run revision stream.
CREATE FUNCTION testdog_model_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id text; owner_team uuid; rev integer;
BEGIN
  UPDATE test_runs SET "realtimeRevision" = "realtimeRevision" + 1 WHERE id = NEW."runId"
    RETURNING "userId", "teamId", "realtimeRevision" INTO owner_id, owner_team, rev;
  IF NOT FOUND THEN RETURN NEW; END IF;
  INSERT INTO realtime_outbox("userId", "teamId", "runId", revision, kind, data)
    VALUES (owner_id, owner_team, NEW."runId", rev, 'model', '{}');
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER testdog_model_event AFTER INSERT ON model_calls
FOR EACH ROW EXECUTE FUNCTION testdog_model_event();
--> statement-breakpoint
CREATE FUNCTION testdog_issue_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE issue_id uuid; owner_id text; owner_team uuid; related_run uuid; row_data jsonb;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  issue_id := CASE WHEN TG_TABLE_NAME = 'issues' THEN (row_data->>'id')::uuid ELSE (row_data->>'issueId')::uuid END;
  IF TG_TABLE_NAME = 'issues' THEN
    owner_id := row_data->>'userId'; owner_team := (row_data->>'teamId')::uuid;
  ELSE
    SELECT "userId", "teamId" INTO owner_id, owner_team FROM issues WHERE id = issue_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
  END IF;
  INSERT INTO realtime_outbox("userId", "teamId", kind, data, summary)
    VALUES (owner_id, owner_team, 'issues', '{}', true);
  FOR related_run IN
    SELECT "runId" FROM issue_occurrences WHERE "issueId" = issue_id
    UNION SELECT "runId" FROM issue_verifications WHERE "issueId" = issue_id
    UNION SELECT (row_data->>'runId')::uuid WHERE row_data->>'runId' IS NOT NULL
    ORDER BY 1
  LOOP
    INSERT INTO realtime_outbox("userId", "teamId", "runId", kind, data)
      VALUES (owner_id, owner_team, related_run, 'issues', '{}');
  END LOOP;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER testdog_issue_event AFTER INSERT OR UPDATE OR DELETE ON issues
FOR EACH ROW EXECUTE FUNCTION testdog_issue_event();
--> statement-breakpoint
CREATE TRIGGER testdog_occurrence_event AFTER INSERT OR UPDATE OR DELETE ON issue_occurrences
FOR EACH ROW EXECUTE FUNCTION testdog_issue_event();
--> statement-breakpoint
CREATE TRIGGER testdog_issue_comment_event AFTER INSERT ON issue_events
FOR EACH ROW EXECUTE FUNCTION testdog_issue_event();
--> statement-breakpoint
CREATE TRIGGER testdog_verification_event AFTER INSERT OR UPDATE OR DELETE ON issue_verifications
FOR EACH ROW EXECUTE FUNCTION testdog_issue_event();
