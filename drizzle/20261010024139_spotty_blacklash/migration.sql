CREATE TABLE "run_browser_logs" (
	"id" uuid PRIMARY KEY,
	"runId" uuid NOT NULL,
	"sequence" bigserial,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "run_browser_logs_run_sequence_idx" ON "run_browser_logs" ("runId","sequence");--> statement-breakpoint
ALTER TABLE "run_browser_logs" ADD CONSTRAINT "run_browser_logs_runId_test_runs_id_fkey" FOREIGN KEY ("runId") REFERENCES "test_runs"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- Drain old workers before migration. Preserve legacy log order and compact run rows.
INSERT INTO "run_browser_logs" ("id", "runId", "data")
SELECT (entry.data->>'id')::uuid, run."id", entry.data
FROM "test_runs" AS run,
LATERAL jsonb_array_elements(run."browserLogs") WITH ORDINALITY AS entry(data, ordinal)
ORDER BY run."startedAt", run."id", entry.ordinal
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "test_runs" SET "browserLogs" = '[]'::jsonb
WHERE "browserLogs" <> '[]'::jsonb;
