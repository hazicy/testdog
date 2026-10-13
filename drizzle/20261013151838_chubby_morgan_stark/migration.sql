-- Apply after stopping the API and workers so no old login preparation remains in flight.
UPDATE "test_cases"
SET target = target - 'loginIdentityId'
WHERE target ? 'loginIdentityId';--> statement-breakpoint
UPDATE "test_runs"
SET "targetSnapshot" = "targetSnapshot" - 'loginIdentityId',
    "environmentSnapshot" = "environmentSnapshot" - 'loginPreparation',
    "replayEnvironmentSnapshot" = "replayEnvironmentSnapshot" - 'loginPreparation'
WHERE "targetSnapshot" ? 'loginIdentityId'
   OR "environmentSnapshot" ? 'loginPreparation'
   OR "replayEnvironmentSnapshot" ? 'loginPreparation';--> statement-breakpoint
UPDATE "recording_versions"
SET "targetSnapshot" = "targetSnapshot" - 'loginIdentityId'
WHERE "targetSnapshot" ? 'loginIdentityId';--> statement-breakpoint
UPDATE "issue_occurrences"
SET snapshot = snapshot #- '{target,loginIdentityId}' #- '{environment,loginPreparation}'
WHERE snapshot->'target' ? 'loginIdentityId'
   OR snapshot->'environment' ? 'loginPreparation';--> statement-breakpoint
UPDATE "submission_requests"
SET response = response #- '{run,authenticationVerification}'
                        #- '{run,targetSnapshot,loginIdentityId}'
                        #- '{run,environmentSnapshot,loginPreparation}'
                        #- '{run,replayEnvironmentSnapshot,loginPreparation}'
WHERE response ? 'run';--> statement-breakpoint
UPDATE "test_runs"
SET status = 'cancelled',
    "cancelRequested" = true,
    "finishedAt" = now(),
    error = '登录身份功能已移除。',
    "errorCode" = 'CANCELLED',
    "leaseUntil" = NULL,
    "fencingToken" = "fencingToken" + 1
WHERE "authenticationVerification" = true
  AND status IN ('queued', 'preparing', 'running', 'finalizing');--> statement-breakpoint
DROP TABLE "login_state_caches";--> statement-breakpoint
DROP TABLE "login_identities";--> statement-breakpoint
ALTER TABLE "test_runs" DROP COLUMN "authenticationVerification";
