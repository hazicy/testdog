ALTER TABLE "recording_versions" ADD COLUMN "schemaVersion" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "recording_versions" ADD COLUMN "platform" text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "recording_versions" ADD COLUMN "targetSnapshot" jsonb;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "capabilities" jsonb;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "evidenceComplete" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "run_artifacts" DROP CONSTRAINT "run_artifacts_kind_check", ADD CONSTRAINT "run_artifacts_kind_check" CHECK ("kind" in ('screenshot','video','trace','snapshot','log','device-trace'));