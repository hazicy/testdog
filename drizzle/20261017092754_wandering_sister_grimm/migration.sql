CREATE TABLE "team_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"teamId" uuid NOT NULL,
	"email" text NOT NULL,
	"tokenHash" text NOT NULL UNIQUE,
	"expiresAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"teamId" uuid NOT NULL,
	"userId" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "team_members_role_check" CHECK ("role" in ('admin', 'member'))
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "browser_provider_integrations" ADD COLUMN "teamId" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "teamId" uuid;--> statement-breakpoint
ALTER TABLE "notification_events" ADD COLUMN "teamId" uuid;--> statement-breakpoint
ALTER TABLE "notification_integrations" ADD COLUMN "teamId" uuid;--> statement-breakpoint
ALTER TABLE "plugin_settings" ADD COLUMN "teamId" uuid;--> statement-breakpoint
ALTER TABLE "realtime_outbox" ADD COLUMN "teamId" uuid;--> statement-breakpoint
ALTER TABLE "submission_requests" ADD COLUMN "teamId" uuid;--> statement-breakpoint
ALTER TABLE "test_cases" ADD COLUMN "teamId" uuid;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "teamId" uuid;--> statement-breakpoint
DROP INDEX "browser_provider_integrations_active_legacy_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "browser_provider_integrations_active_legacy_idx" ON "browser_provider_integrations" ((1)) WHERE "userId" is null and "teamId" is null and "enabled" = true;--> statement-breakpoint
DROP INDEX "browser_provider_integrations_legacy_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "browser_provider_integrations_legacy_idx" ON "browser_provider_integrations" ("provider") WHERE "userId" is null and "teamId" is null;--> statement-breakpoint
DROP INDEX "notification_integrations_legacy_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "notification_integrations_legacy_idx" ON "notification_integrations" ("channel") WHERE "userId" is null and "teamId" is null;--> statement-breakpoint
DROP INDEX "plugin_settings_legacy_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_settings_legacy_idx" ON "plugin_settings" ("pluginId") WHERE "userId" is null and "teamId" is null;--> statement-breakpoint
DROP INDEX "submission_requests_legacy_key_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "submission_requests_legacy_key_idx" ON "submission_requests" ("key") WHERE "userId" is null and "teamId" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "browserProviderIntegrations_team_idx" ON "browser_provider_integrations" ("teamId","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "browser_providers_active_team_idx" ON "browser_provider_integrations" ("teamId") WHERE "enabled" = true;--> statement-breakpoint
CREATE INDEX "issues_team_idx" ON "issues" ("teamId","updatedAt","id");--> statement-breakpoint
CREATE UNIQUE INDEX "notificationIntegrations_team_idx" ON "notification_integrations" ("teamId","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "pluginSettings_team_idx" ON "plugin_settings" ("teamId","pluginId");--> statement-breakpoint
CREATE INDEX "realtime_outbox_team_summary_idx" ON "realtime_outbox" ("teamId","id") WHERE "summary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "submissionRequests_team_idx" ON "submission_requests" ("teamId","key");--> statement-breakpoint
CREATE UNIQUE INDEX "team_invitations_team_email_idx" ON "team_invitations" ("teamId","email");--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_team_user_idx" ON "team_members" ("teamId","userId");--> statement-breakpoint
CREATE INDEX "team_members_user_idx" ON "team_members" ("userId");--> statement-breakpoint
CREATE INDEX "testCases_team_idx" ON "test_cases" ("teamId","updatedAt","id");--> statement-breakpoint
CREATE INDEX "testRuns_team_idx" ON "test_runs" ("teamId","startedAt","id");--> statement-breakpoint
ALTER TABLE "browser_provider_integrations" ADD CONSTRAINT "browser_provider_integrations_teamId_teams_id_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id");--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_teamId_teams_id_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id");--> statement-breakpoint
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_teamId_teams_id_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id");--> statement-breakpoint
ALTER TABLE "notification_integrations" ADD CONSTRAINT "notification_integrations_teamId_teams_id_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id");--> statement-breakpoint
ALTER TABLE "plugin_settings" ADD CONSTRAINT "plugin_settings_teamId_teams_id_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id");--> statement-breakpoint
ALTER TABLE "realtime_outbox" ADD CONSTRAINT "realtime_outbox_teamId_teams_id_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id");--> statement-breakpoint
ALTER TABLE "submission_requests" ADD CONSTRAINT "submission_requests_teamId_teams_id_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id");--> statement-breakpoint
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_teamId_teams_id_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teamId_teams_id_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_userId_auth_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_teamId_teams_id_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id");--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_teamId_teams_id_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id");--> statement-breakpoint
ALTER TABLE "browser_provider_integrations" ADD CONSTRAINT "browserProviderIntegrations_ownership_check" CHECK ("userId" is null or "teamId" is null);--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_ownership_check" CHECK ("userId" is null or "teamId" is null);--> statement-breakpoint
ALTER TABLE "notification_integrations" ADD CONSTRAINT "notificationIntegrations_ownership_check" CHECK ("userId" is null or "teamId" is null);--> statement-breakpoint
ALTER TABLE "plugin_settings" ADD CONSTRAINT "pluginSettings_ownership_check" CHECK ("userId" is null or "teamId" is null);--> statement-breakpoint
ALTER TABLE "realtime_outbox" ADD CONSTRAINT "realtimeOutbox_ownership_check" CHECK ("userId" is null or "teamId" is null);--> statement-breakpoint
ALTER TABLE "submission_requests" ADD CONSTRAINT "submissionRequests_ownership_check" CHECK ("userId" is null or "teamId" is null);--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "testCases_ownership_check" CHECK ("userId" is null or "teamId" is null);--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "testRuns_ownership_check" CHECK ("userId" is null or "teamId" is null);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION testdog_realtime_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_data jsonb;
  run_id uuid;
  owner_id text;
  owner_team uuid;
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
    owner_team := NEW."teamId";
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
    owner_team := CASE WHEN TG_OP = 'DELETE' THEN OLD."teamId" ELSE NEW."teamId" END;
    INSERT INTO realtime_outbox("userId", "teamId", kind, data, summary) VALUES (owner_id, owner_team, 'tests', '{}', true);
    IF TG_OP = 'UPDATE' AND (OLD."userId" IS DISTINCT FROM NEW."userId" OR OLD."teamId" IS DISTINCT FROM NEW."teamId") THEN
      INSERT INTO realtime_outbox("userId", "teamId", kind, data, summary) VALUES (OLD."userId", OLD."teamId", 'tests', '{}', true);
    END IF;
    RETURN NULL;
  ELSE
    run_id := NEW."runId";
    SELECT "userId", "teamId" INTO owner_id, owner_team FROM test_runs WHERE id = run_id;
    UPDATE test_runs SET "realtimeRevision" = "realtimeRevision" + 1
      WHERE id = run_id RETURNING "realtimeRevision" INTO rev;
    event_kind := CASE TG_TABLE_NAME WHEN 'run_steps' THEN 'step'
      WHEN 'run_artifacts' THEN 'artifact'
      WHEN 'automation_run_events' THEN 'event' ELSE 'log' END;
    row_data := row_data - 'path';
  END IF;
  INSERT INTO realtime_outbox("userId", "teamId", "runId", revision, kind, data, summary)
    VALUES (owner_id, owner_team, run_id, rev, event_kind, row_data, summary_changed);
  IF TG_TABLE_NAME = 'test_runs' AND TG_OP = 'UPDATE' THEN
    IF (OLD."userId" IS DISTINCT FROM NEW."userId" OR OLD."teamId" IS DISTINCT FROM NEW."teamId") THEN
      INSERT INTO realtime_outbox("userId", "teamId", kind, data, summary) VALUES (OLD."userId", OLD."teamId", 'tests', '{}', true);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

--> statement-breakpoint
CREATE FUNCTION testdog_notification_emit(owner_id text, owner_team uuid, event_kind text, source_key text, message_title text, message_body text, message_path text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE event_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM notification_integrations i WHERE i."userId" IS NOT DISTINCT FROM owner_id AND i."teamId" IS NOT DISTINCT FROM owner_team AND i.enabled AND i.events ? event_kind) THEN RETURN; END IF;
  INSERT INTO notification_events ("userId", "teamId", "sourceKey", "eventType", payload)
    VALUES (owner_id, owner_team, source_key, event_kind, jsonb_build_object('title', message_title, 'body', message_body, 'path', message_path))
    ON CONFLICT ("sourceKey") DO NOTHING RETURNING id INTO event_id;
  IF event_id IS NULL THEN SELECT id INTO event_id FROM notification_events WHERE "sourceKey" = source_key; END IF;
  INSERT INTO notification_deliveries ("integrationId", "integrationVersion", "eventId")
    SELECT i.id, i.version, event_id FROM notification_integrations i
    WHERE i."userId" IS NOT DISTINCT FROM owner_id AND i."teamId" IS NOT DISTINCT FROM owner_team AND i.enabled AND i.events ? event_kind
    ON CONFLICT ("integrationId", "eventId") DO NOTHING;
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION testdog_notification_emit(owner_id text, event_kind text, source_key text, message_title text, message_body text, message_path text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM testdog_notification_emit(owner_id, NULL::uuid, event_kind, source_key, message_title, message_body, message_path);
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION testdog_notify_run() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE verification record; status_label text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status NOT IN ('passed','failed','cancelled') THEN RETURN NEW; END IF;
  IF NEW.status = 'failed' THEN
    PERFORM testdog_notification_emit(NEW."userId", NEW."teamId", 'run.failed', 'run.failed:' || NEW.id, '执行失败：' || NEW.name, '测试执行失败，请打开执行记录查看失败步骤和证据。', '/runs/' || NEW.id);
  END IF;
  status_label := CASE NEW.status WHEN 'passed' THEN '通过' WHEN 'failed' THEN '失败' ELSE '已停止' END;
  FOR verification IN SELECT v.id, v."issueId" FROM issue_verifications v JOIN issues i ON i.id = v."issueId" WHERE v."runId" = NEW.id AND i."userId" IS NOT DISTINCT FROM NEW."userId" AND i."teamId" IS NOT DISTINCT FROM NEW."teamId" LOOP
    PERFORM testdog_notification_emit(NEW."userId", NEW."teamId", 'verification.completed', 'verification.completed:' || verification.id, '回归执行完成：' || NEW.name, '执行结果：' || status_label || '。请打开问题详情确认目标验证结论。', '/issues/' || verification."issueId");
  END LOOP;
  RETURN NEW;
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION testdog_notify_issue() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE status_label text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM testdog_notification_emit(NEW."userId", NEW."teamId", 'issue.created', 'issue.created:' || NEW.id, '新问题：' || NEW.title, '测试工作区中创建了新问题，请查看发现记录和相关证据。', '/issues/' || NEW.id);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    status_label := CASE NEW.status WHEN 'open' THEN '待确认' WHEN 'in_progress' THEN '处理中' WHEN 'pending_verification' THEN '待验证' ELSE '已关闭' END;
    PERFORM testdog_notification_emit(NEW."userId", NEW."teamId", 'issue.status_changed', 'issue.status_changed:' || NEW.id || ':' || NEW.version, '问题状态更新：' || NEW.title, '当前状态：' || status_label, '/issues/' || NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
