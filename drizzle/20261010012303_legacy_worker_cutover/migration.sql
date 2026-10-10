-- Deployment prerequisite: stop and drain the old API-owned execution processes.
-- Historical recordings remain desktop runs; only unfinished, lease-less work is terminated.
UPDATE "test_runs"
SET "status" = CASE WHEN "cancelRequested" THEN 'cancelled' ELSE 'failed' END,
    "errorCode" = CASE WHEN "cancelRequested" THEN 'CANCELLED' ELSE 'LEGACY_WORKER_STOPPED' END,
    "error" = coalesce("error", '旧执行服务已切换，请重新运行。'),
    "finishedAt" = now(),
    "durationMs" = greatest(0, round(extract(epoch from (now() - "startedAt")) * 1000))::integer,
    "replayable" = false,
    "evidenceComplete" = false
WHERE "status" IN ('preparing', 'running', 'finalizing')
  AND "leaseUntil" IS NULL AND "resourceId" IS NULL;
--> statement-breakpoint
UPDATE "run_steps" AS step
SET "status" = 'failed',
    "finishedAt" = run."finishedAt",
    "durationMs" = greatest(0, round(extract(epoch from (run."finishedAt" - step."startedAt")) * 1000))::integer,
    "error" = coalesce(step."error", run."error")
FROM "test_runs" AS run
WHERE step."runId" = run."id" AND step."status" = 'running'
  AND run."errorCode" IN ('LEGACY_WORKER_STOPPED', 'CANCELLED')
  AND run."leaseUntil" IS NULL AND run."resourceId" IS NULL;
--> statement-breakpoint
UPDATE "recording_versions" AS version
SET "targetSnapshot" = run."targetSnapshot"
FROM "test_runs" AS run
WHERE version."runId" = run."id" AND version."targetSnapshot" IS NULL;
