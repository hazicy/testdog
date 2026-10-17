CREATE TABLE "suite_cases" (
	"suiteId" uuid NOT NULL,
	"testId" uuid NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suite_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"userId" text,
	"teamId" uuid,
	"suiteId" uuid,
	"name" text NOT NULL,
	"total" integer NOT NULL,
	"cancelRequested" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suite_runs_ownership_check" CHECK ("userId" is null or "teamId" is null),
	CONSTRAINT "suite_runs_total_check" CHECK ("total" > 0)
);
--> statement-breakpoint
CREATE TABLE "test_suites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"userId" text,
	"teamId" uuid,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_suites_ownership_check" CHECK ("userId" is null or "teamId" is null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "suite_cases_suite_test_idx" ON "suite_cases" ("suiteId","testId");--> statement-breakpoint
CREATE INDEX "suite_cases_test_idx" ON "suite_cases" ("testId");--> statement-breakpoint
CREATE INDEX "suite_runs_user_created_idx" ON "suite_runs" ("userId","createdAt","id");--> statement-breakpoint
CREATE INDEX "suite_runs_team_created_idx" ON "suite_runs" ("teamId","createdAt","id");--> statement-breakpoint
CREATE INDEX "suite_runs_suite_created_idx" ON "suite_runs" ("suiteId","createdAt","id");--> statement-breakpoint
CREATE INDEX "test_runs_batch_idx" ON "test_runs" ("batchId");--> statement-breakpoint
CREATE INDEX "test_suites_user_updated_idx" ON "test_suites" ("userId","updatedAt","id");--> statement-breakpoint
CREATE INDEX "test_suites_team_updated_idx" ON "test_suites" ("teamId","updatedAt","id");--> statement-breakpoint
ALTER TABLE "suite_cases" ADD CONSTRAINT "suite_cases_suiteId_test_suites_id_fkey" FOREIGN KEY ("suiteId") REFERENCES "test_suites"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "suite_cases" ADD CONSTRAINT "suite_cases_testId_test_cases_id_fkey" FOREIGN KEY ("testId") REFERENCES "test_cases"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "suite_runs" ADD CONSTRAINT "suite_runs_userId_auth_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id");--> statement-breakpoint
ALTER TABLE "suite_runs" ADD CONSTRAINT "suite_runs_teamId_teams_id_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id");--> statement-breakpoint
ALTER TABLE "suite_runs" ADD CONSTRAINT "suite_runs_suiteId_test_suites_id_fkey" FOREIGN KEY ("suiteId") REFERENCES "test_suites"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "test_suites" ADD CONSTRAINT "test_suites_userId_auth_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id");--> statement-breakpoint
ALTER TABLE "test_suites" ADD CONSTRAINT "test_suites_teamId_teams_id_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id");
--> statement-breakpoint
CREATE FUNCTION testdog_suite_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data jsonb;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  INSERT INTO realtime_outbox("userId", "teamId", kind, data, summary)
    VALUES (row_data->>'userId', (row_data->>'teamId')::uuid, 'suites', '{}', true);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER testdog_suite_event AFTER INSERT OR UPDATE OR DELETE ON test_suites
  FOR EACH ROW EXECUTE FUNCTION testdog_suite_event();
