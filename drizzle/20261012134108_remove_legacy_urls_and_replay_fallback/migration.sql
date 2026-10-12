-- Stop API/worker writers before migration and restart with the matching application.
-- Preserve legacy desktop behavior; an existing target is authoritative over the old URL.
UPDATE "test_cases"
SET target = jsonb_build_object('schemaVersion', 1, 'platform', 'web', 'url', url,
                               'browser', 'chromium', 'deviceProfile', 'legacy-desktop')
WHERE target IS NULL OR target = 'null'::jsonb;
--> statement-breakpoint
UPDATE "test_runs"
SET "targetSnapshot" = jsonb_build_object('schemaVersion', 1, 'platform', 'web', 'url', url,
                                         'browser', 'chromium', 'deviceProfile', 'legacy-desktop')
WHERE "targetSnapshot" IS NULL OR "targetSnapshot" = 'null'::jsonb;
--> statement-breakpoint
-- Only replay jobs missing their frozen input used runtime source lookups.
-- Existing snapshots are immutable. Prefer an explicitly selected recording version.
UPDATE "test_runs" AS replay
SET "recordingSteps" = coalesce(
      (SELECT version.steps FROM recording_versions AS version
       WHERE version.id = replay."recordingVersionId" AND version."runId" = source.id),
      (SELECT coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(step)) ORDER BY step.sequence), '[]'::jsonb)
       FROM run_steps AS step WHERE step."runId" = source.id)),
    plan = coalesce(nullif(replay.plan, 'null'::jsonb), source.plan),
    "replayEnvironmentSnapshot" = source."environmentSnapshot"
FROM "test_runs" AS source
WHERE replay.mode = 'replay' AND (replay."recordingSteps" IS NULL OR replay."recordingSteps" = 'null'::jsonb)
  AND replay."sourceRunId" = source.id
  AND replay."userId" IS NOT DISTINCT FROM source."userId";
--> statement-breakpoint
-- Do not cut over runnable replay jobs whose missing source cannot be reconstructed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM test_runs
    WHERE mode = 'replay' AND status IN ('queued', 'preparing', 'running', 'finalizing')
      AND ("recordingSteps" IS NULL OR "recordingSteps" = 'null'::jsonb)
  ) THEN
    RAISE EXCEPTION 'Active legacy replay is missing its source snapshot; migration aborted';
  END IF;
END;
$$;
--> statement-breakpoint
-- SSE catch-up must also be readable after removing the runtime target fallback.
UPDATE realtime_outbox AS event
SET data = (event.data - 'url') || jsonb_build_object(
  'targetSnapshot', coalesce(nullif(event.data->'targetSnapshot', 'null'::jsonb), run."targetSnapshot"))
FROM test_runs AS run
WHERE event.kind = 'run' AND event."runId" = run.id;
--> statement-breakpoint
ALTER TABLE "test_cases" DROP COLUMN "url";--> statement-breakpoint
ALTER TABLE "test_runs" DROP COLUMN "url";--> statement-breakpoint
ALTER TABLE "test_cases" ALTER COLUMN "target" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "test_runs" ALTER COLUMN "targetSnapshot" SET NOT NULL;
