ALTER INDEX IF EXISTS "browserProviderIntegrations_team_idx" RENAME TO "browser_provider_integrations_team_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "notificationIntegrations_team_idx" RENAME TO "notification_integrations_team_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "pluginSettings_team_idx" RENAME TO "plugin_settings_team_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "submissionRequests_team_idx" RENAME TO "submission_requests_team_key_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "testCases_team_idx" RENAME TO "test_cases_team_updated_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "testRuns_team_idx" RENAME TO "test_runs_team_started_idx";
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"browser_provider_integrations"'::regclass AND conname = 'browserProviderIntegrations_ownership_check') THEN
    ALTER TABLE "browser_provider_integrations" RENAME CONSTRAINT "browserProviderIntegrations_ownership_check" TO "browser_provider_integrations_ownership_check";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"notification_integrations"'::regclass AND conname = 'notificationIntegrations_ownership_check') THEN
    ALTER TABLE "notification_integrations" RENAME CONSTRAINT "notificationIntegrations_ownership_check" TO "notification_integrations_ownership_check";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"plugin_settings"'::regclass AND conname = 'pluginSettings_ownership_check') THEN
    ALTER TABLE "plugin_settings" RENAME CONSTRAINT "pluginSettings_ownership_check" TO "plugin_settings_ownership_check";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"realtime_outbox"'::regclass AND conname = 'realtimeOutbox_ownership_check') THEN
    ALTER TABLE "realtime_outbox" RENAME CONSTRAINT "realtimeOutbox_ownership_check" TO "realtime_outbox_ownership_check";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"submission_requests"'::regclass AND conname = 'submissionRequests_ownership_check') THEN
    ALTER TABLE "submission_requests" RENAME CONSTRAINT "submissionRequests_ownership_check" TO "submission_requests_ownership_check";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"test_cases"'::regclass AND conname = 'testCases_ownership_check') THEN
    ALTER TABLE "test_cases" RENAME CONSTRAINT "testCases_ownership_check" TO "test_cases_ownership_check";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"test_runs"'::regclass AND conname = 'testRuns_ownership_check') THEN
    ALTER TABLE "test_runs" RENAME CONSTRAINT "testRuns_ownership_check" TO "test_runs_ownership_check";
  END IF;
END $$;
