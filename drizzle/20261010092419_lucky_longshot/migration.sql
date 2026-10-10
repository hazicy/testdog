CREATE TABLE "model_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"runId" uuid NOT NULL,
	"startedAt" timestamp with time zone NOT NULL,
	"durationMs" integer NOT NULL,
	"model" text NOT NULL,
	"status" text NOT NULL,
	"retryCount" integer NOT NULL,
	"failedAttempts" integer NOT NULL,
	"inputTokens" integer,
	"outputTokens" integer,
	"errorCode" text
);
--> statement-breakpoint
CREATE TABLE "submission_requests" (
	"key" uuid PRIMARY KEY,
	"fingerprint" text NOT NULL,
	"response" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "test_runs_case_idx";--> statement-breakpoint
CREATE INDEX "test_runs_case_idx" ON "test_runs" ("testId","startedAt","id");--> statement-breakpoint
DROP INDEX "test_runs_active_lease_idx";--> statement-breakpoint
CREATE INDEX "test_runs_active_lease_idx" ON "test_runs" ("leaseUntil") WHERE "status" in ('preparing','running','finalizing');--> statement-breakpoint
CREATE INDEX "model_calls_run_idx" ON "model_calls" ("runId","startedAt","id");--> statement-breakpoint
CREATE INDEX "test_cases_updated_idx" ON "test_cases" ("updatedAt","id");--> statement-breakpoint
CREATE INDEX "test_runs_status_started_idx" ON "test_runs" ("status","startedAt","id");--> statement-breakpoint
CREATE INDEX "test_runs_queued_at_idx" ON "test_runs" ("queuedAt") WHERE "status" = 'queued';--> statement-breakpoint
ALTER TABLE "model_calls" ADD CONSTRAINT "model_calls_runId_test_runs_id_fkey" FOREIGN KEY ("runId") REFERENCES "test_runs"("id") ON DELETE CASCADE;