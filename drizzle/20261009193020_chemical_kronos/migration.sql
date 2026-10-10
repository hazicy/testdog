DROP INDEX "test_runs_status_idx";--> statement-breakpoint
DROP INDEX "recording_versions_run_idx";--> statement-breakpoint
CREATE INDEX "recording_versions_run_idx" ON "recording_versions" ("runId","createdAt","id");--> statement-breakpoint
DROP INDEX "run_artifacts_timeline_idx";--> statement-breakpoint
CREATE INDEX "run_artifacts_timeline_idx" ON "run_artifacts" ("runId","elapsedMs","capturedAt","id");--> statement-breakpoint
DROP INDEX "test_runs_started_idx";--> statement-breakpoint
CREATE INDEX "test_runs_started_idx" ON "test_runs" ("startedAt","id");--> statement-breakpoint
CREATE INDEX "test_runs_active_lease_idx" ON "test_runs" ("heartbeatAt") WHERE "status" = 'running';