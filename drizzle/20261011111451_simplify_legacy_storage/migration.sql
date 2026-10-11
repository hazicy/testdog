-- Stop API/worker writers before applying; deploy the matching application afterwards.
-- A populated legacy users table is retained as an unmanaged archive.
DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM "users" LIMIT 1) THEN
      DROP TABLE "users";
    END IF;
  END IF;
END;
$$;
--> statement-breakpoint
-- Preserve any logs written by legacy workers after the original backfill.
INSERT INTO "run_browser_logs" ("id", "runId", "data")
SELECT (entry.data->>'id')::uuid, run."id", entry.data
FROM "test_runs" AS run,
LATERAL jsonb_array_elements(run."browserLogs") WITH ORDINALITY AS entry(data, ordinal)
ORDER BY run."startedAt", run."id", entry.ordinal
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Refuse to remove the source if a conflicting log ID would lose historical data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "test_runs" AS run,
    LATERAL jsonb_array_elements(run."browserLogs") AS entry(data)
    WHERE NOT EXISTS (
      SELECT 1 FROM "run_browser_logs" AS log
      WHERE log.id = (entry.data->>'id')::uuid
        AND log."runId" = run.id AND log.data = entry.data
    )
  ) THEN
    RAISE EXCEPTION 'Legacy browser logs conflict with stored logs; source column retained';
  END IF;
END;
$$;
--> statement-breakpoint
ALTER TABLE "test_runs" DROP COLUMN "browserLogs";
