ALTER TABLE "test_cases" ADD COLUMN "target" jsonb;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "targetSnapshot" jsonb;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "environmentSnapshot" jsonb;
--> statement-breakpoint
UPDATE "test_cases" SET "target" = jsonb_build_object('schemaVersion', 1, 'platform', 'web', 'url', "url", 'browser', 'chromium', 'deviceProfile', 'legacy-desktop') WHERE "target" IS NULL;
--> statement-breakpoint
UPDATE "test_runs" SET "targetSnapshot" = jsonb_build_object('schemaVersion', 1, 'platform', 'web', 'url', "url", 'browser', 'chromium', 'deviceProfile', 'legacy-desktop') WHERE "targetSnapshot" IS NULL;
