CREATE TABLE "run_artifacts" (
	"id" uuid PRIMARY KEY,
	"runId" uuid NOT NULL,
	"stepId" uuid,
	"kind" text NOT NULL,
	"stage" text NOT NULL,
	"pageId" text NOT NULL,
	"pageUrl" text NOT NULL,
	"capturedAt" timestamp with time zone NOT NULL,
	"elapsedMs" integer NOT NULL,
	"path" text NOT NULL,
	"contentType" text NOT NULL,
	"size" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_steps" (
	"id" uuid PRIMARY KEY,
	"runId" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"startedAt" timestamp with time zone NOT NULL,
	"finishedAt" timestamp with time zone,
	"durationMs" integer,
	"pageId" text NOT NULL,
	"pageUrl" text NOT NULL,
	"action" jsonb,
	"assertion" jsonb,
	"condition" text,
	"decision" boolean,
	"evidence" text,
	"error" text,
	"replayable" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"url" text NOT NULL,
	"goal" text NOT NULL,
	"tags" jsonb DEFAULT '[]' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"testId" uuid,
	"sourceRunId" uuid,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"goal" text NOT NULL,
	"mode" text DEFAULT 'record' NOT NULL,
	"status" text NOT NULL,
	"plan" jsonb,
	"events" jsonb DEFAULT '[]' NOT NULL,
	"replayable" boolean DEFAULT false NOT NULL,
	"cancelRequested" boolean DEFAULT false NOT NULL,
	"workerId" text NOT NULL,
	"heartbeatAt" timestamp with time zone DEFAULT now() NOT NULL,
	"startedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"finishedAt" timestamp with time zone,
	"durationMs" integer,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "run_artifacts_timeline_idx" ON "run_artifacts" ("runId","elapsedMs");--> statement-breakpoint
CREATE UNIQUE INDEX "run_steps_sequence_idx" ON "run_steps" ("runId","sequence");--> statement-breakpoint
CREATE INDEX "test_runs_started_idx" ON "test_runs" ("startedAt");--> statement-breakpoint
CREATE INDEX "test_runs_case_idx" ON "test_runs" ("testId");--> statement-breakpoint
CREATE INDEX "test_runs_status_idx" ON "test_runs" ("status");--> statement-breakpoint
ALTER TABLE "run_artifacts" ADD CONSTRAINT "run_artifacts_runId_test_runs_id_fkey" FOREIGN KEY ("runId") REFERENCES "test_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "run_artifacts" ADD CONSTRAINT "run_artifacts_stepId_run_steps_id_fkey" FOREIGN KEY ("stepId") REFERENCES "run_steps"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_runId_test_runs_id_fkey" FOREIGN KEY ("runId") REFERENCES "test_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_testId_test_cases_id_fkey" FOREIGN KEY ("testId") REFERENCES "test_cases"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_sourceRunId_test_runs_id_fkey" FOREIGN KEY ("sourceRunId") REFERENCES "test_runs"("id") ON DELETE SET NULL;