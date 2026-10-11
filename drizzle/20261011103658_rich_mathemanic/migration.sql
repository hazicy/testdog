CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"integrationId" uuid NOT NULL,
	"integrationVersion" integer NOT NULL,
	"eventId" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lastError" text,
	"leaseToken" uuid,
	"leaseUntil" timestamp with time zone,
	"nextAttemptAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"sentAt" timestamp with time zone,
	CONSTRAINT "notification_deliveries_status_check" CHECK ("status" in ('pending','sending','sent','failed','skipped'))
);
--> statement-breakpoint
CREATE TABLE "notification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"userId" text,
	"sourceKey" text NOT NULL UNIQUE,
	"eventType" text NOT NULL,
	"payload" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"userId" text,
	"channel" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"events" jsonb DEFAULT '[]' NOT NULL,
	"encryptedConfig" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_integrations_channel_check" CHECK ("channel" in ('feishu','email'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_event_idx" ON "notification_deliveries" ("integrationId","eventId");--> statement-breakpoint
CREATE INDEX "notification_deliveries_due_idx" ON "notification_deliveries" ("status","nextAttemptAt");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_integrations_owner_idx" ON "notification_integrations" ("userId","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_integrations_legacy_idx" ON "notification_integrations" ("channel") WHERE "userId" is null;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_F6hxXQItJpzW_fkey" FOREIGN KEY ("integrationId") REFERENCES "notification_integrations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_eventId_notification_events_id_fkey" FOREIGN KEY ("eventId") REFERENCES "notification_events"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_userId_auth_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id");--> statement-breakpoint
ALTER TABLE "notification_integrations" ADD CONSTRAINT "notification_integrations_userId_auth_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id");--> statement-breakpoint
CREATE FUNCTION caseforge_notification_emit(owner_id text, event_kind text, source_key text, message_title text, message_body text, message_path text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE event_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM notification_integrations i WHERE i."userId" IS NOT DISTINCT FROM owner_id AND i.enabled AND i.events ? event_kind) THEN RETURN; END IF;
  INSERT INTO notification_events ("userId", "sourceKey", "eventType", payload)
    VALUES (owner_id, source_key, event_kind, jsonb_build_object('title', message_title, 'body', message_body, 'path', message_path))
    ON CONFLICT ("sourceKey") DO NOTHING RETURNING id INTO event_id;
  IF event_id IS NULL THEN SELECT id INTO event_id FROM notification_events WHERE "sourceKey" = source_key; END IF;
  INSERT INTO notification_deliveries ("integrationId", "integrationVersion", "eventId")
    SELECT i.id, i.version, event_id FROM notification_integrations i
    WHERE i."userId" IS NOT DISTINCT FROM owner_id AND i.enabled AND i.events ? event_kind
    ON CONFLICT ("integrationId", "eventId") DO NOTHING;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION caseforge_notify_run() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE verification record; status_label text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status NOT IN ('passed','failed','cancelled') THEN RETURN NEW; END IF;
  IF NEW.status = 'failed' THEN
    PERFORM caseforge_notification_emit(NEW."userId", 'run.failed', 'run.failed:' || NEW.id, '执行失败：' || NEW.name, '测试执行失败，请打开执行记录查看失败步骤和证据。', '/runs/' || NEW.id);
  END IF;
  status_label := CASE NEW.status WHEN 'passed' THEN '通过' WHEN 'failed' THEN '失败' ELSE '已停止' END;
  FOR verification IN SELECT v.id, v."issueId" FROM issue_verifications v JOIN issues i ON i.id = v."issueId" WHERE v."runId" = NEW.id AND i."userId" IS NOT DISTINCT FROM NEW."userId" LOOP
    PERFORM caseforge_notification_emit(NEW."userId", 'verification.completed', 'verification.completed:' || verification.id, '回归执行完成：' || NEW.name, '执行结果：' || status_label || '。请打开问题详情确认目标验证结论。', '/issues/' || verification."issueId");
  END LOOP;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER caseforge_notify_run AFTER UPDATE OF status ON test_runs FOR EACH ROW EXECUTE FUNCTION caseforge_notify_run();
--> statement-breakpoint
CREATE FUNCTION caseforge_notify_issue() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE status_label text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM caseforge_notification_emit(NEW."userId", 'issue.created', 'issue.created:' || NEW.id, '新问题：' || NEW.title, '测试工作区中创建了新问题，请查看发现记录和相关证据。', '/issues/' || NEW.id);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    status_label := CASE NEW.status WHEN 'open' THEN '待确认' WHEN 'in_progress' THEN '处理中' WHEN 'pending_verification' THEN '待验证' ELSE '已关闭' END;
    PERFORM caseforge_notification_emit(NEW."userId", 'issue.status_changed', 'issue.status_changed:' || NEW.id || ':' || NEW.version, '问题状态更新：' || NEW.title, '当前状态：' || status_label, '/issues/' || NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER caseforge_notify_issue AFTER INSERT OR UPDATE OF status ON issues FOR EACH ROW EXECUTE FUNCTION caseforge_notify_issue();
