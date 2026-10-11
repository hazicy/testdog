CREATE TABLE "issue_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"issueId" uuid NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"issueId" uuid NOT NULL,
	"runId" uuid NOT NULL,
	"stepId" uuid,
	"snapshot" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"issueId" uuid NOT NULL,
	"occurrenceId" uuid NOT NULL,
	"runId" uuid NOT NULL UNIQUE,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"userId" text,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"category" text DEFAULT 'product' NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"closeReason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issues_status_check" CHECK ("status" in ('open','in_progress','pending_verification','closed')),
	CONSTRAINT "issues_category_check" CHECK ("category" in ('product','test','environment','execution')),
	CONSTRAINT "issues_severity_check" CHECK ("severity" in ('critical','high','medium','low')),
	CONSTRAINT "issues_close_reason_check" CHECK (("status" = 'closed' and "closeReason" is not null and "closeReason" in ('fixed','dismissed','duplicate','unreproducible')) or ("status" <> 'closed' and "closeReason" is null))
);
--> statement-breakpoint
CREATE INDEX "issue_events_issue_idx" ON "issue_events" ("issueId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_occurrences_source_idx" ON "issue_occurrences" ("issueId","runId","stepId");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_occurrences_run_idx" ON "issue_occurrences" ("issueId","runId") WHERE "stepId" is null;--> statement-breakpoint
CREATE INDEX "issue_occurrences_issue_idx" ON "issue_occurrences" ("issueId","createdAt");--> statement-breakpoint
CREATE INDEX "issue_verifications_issue_idx" ON "issue_verifications" ("issueId","createdAt");--> statement-breakpoint
CREATE INDEX "issues_user_updated_idx" ON "issues" ("userId","updatedAt","id");--> statement-breakpoint
ALTER TABLE "issue_events" ADD CONSTRAINT "issue_events_issueId_issues_id_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "issue_occurrences" ADD CONSTRAINT "issue_occurrences_issueId_issues_id_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "issue_occurrences" ADD CONSTRAINT "issue_occurrences_runId_test_runs_id_fkey" FOREIGN KEY ("runId") REFERENCES "test_runs"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "issue_occurrences" ADD CONSTRAINT "issue_occurrences_stepId_run_steps_id_fkey" FOREIGN KEY ("stepId") REFERENCES "run_steps"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "issue_verifications" ADD CONSTRAINT "issue_verifications_issueId_issues_id_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "issue_verifications" ADD CONSTRAINT "issue_verifications_occurrenceId_issue_occurrences_id_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "issue_occurrences"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "issue_verifications" ADD CONSTRAINT "issue_verifications_runId_test_runs_id_fkey" FOREIGN KEY ("runId") REFERENCES "test_runs"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_userId_auth_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id");