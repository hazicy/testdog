CREATE TABLE "recording_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"runId" uuid NOT NULL,
	"code" text NOT NULL,
	"steps" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_steps" ADD COLUMN "planNodeId" text;--> statement-breakpoint
ALTER TABLE "run_steps" ADD COLUMN "playwrightAssertion" jsonb;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "recordingVersionId" uuid;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "recordingSteps" jsonb;--> statement-breakpoint
CREATE INDEX "recording_versions_run_idx" ON "recording_versions" ("runId","createdAt");--> statement-breakpoint
ALTER TABLE "recording_versions" ADD CONSTRAINT "recording_versions_runId_test_runs_id_fkey" FOREIGN KEY ("runId") REFERENCES "test_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_recordingVersionId_recording_versions_id_fkey" FOREIGN KEY ("recordingVersionId") REFERENCES "recording_versions"("id") ON DELETE SET NULL;