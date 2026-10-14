-- Apply with the API and workers stopped before deploying the new runtime.
UPDATE "test_cases" SET target = target - 'inputs' WHERE target ? 'inputs';--> statement-breakpoint
UPDATE "test_runs" SET "targetSnapshot" = "targetSnapshot" - 'inputs'
WHERE "targetSnapshot" ? 'inputs';--> statement-breakpoint
UPDATE "recording_versions" SET "targetSnapshot" = "targetSnapshot" - 'inputs'
WHERE "targetSnapshot" ? 'inputs';--> statement-breakpoint
UPDATE "issue_occurrences" SET snapshot = snapshot #- '{target,inputs}'
WHERE snapshot->'target' ? 'inputs';--> statement-breakpoint
UPDATE "submission_requests" SET response = response #- '{run,targetSnapshot,inputs}'
WHERE response->'run'->'targetSnapshot' ? 'inputs';
