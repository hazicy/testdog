CREATE INDEX "issue_occurrences_run_step_idx" ON "issue_occurrences" ("runId","stepId");--> statement-breakpoint
CREATE INDEX "issue_occurrences_step_idx" ON "issue_occurrences" ("stepId");--> statement-breakpoint
CREATE INDEX "issue_verifications_occurrence_idx" ON "issue_verifications" ("occurrenceId");--> statement-breakpoint
CREATE INDEX "notification_deliveries_event_id_idx" ON "notification_deliveries" ("eventId");--> statement-breakpoint
CREATE INDEX "run_artifacts_step_idx" ON "run_artifacts" ("stepId");--> statement-breakpoint
CREATE INDEX "run_steps_model_call_idx" ON "run_steps" ("modelCallId");--> statement-breakpoint
CREATE INDEX "test_runs_source_idx" ON "test_runs" ("sourceRunId");--> statement-breakpoint
CREATE INDEX "test_runs_recording_version_idx" ON "test_runs" ("recordingVersionId");--> statement-breakpoint
ALTER TABLE "automation_builds" ADD CONSTRAINT "automation_builds_platform_check" CHECK ("platform" in ('android','ios'));--> statement-breakpoint
ALTER TABLE "automation_resources" ADD CONSTRAINT "automation_resources_platform_check" CHECK ("platform" in ('web','android','ios'));--> statement-breakpoint
ALTER TABLE "issue_events" ADD CONSTRAINT "issue_events_kind_check" CHECK ("kind" in ('created','updated','comment','occurrence','verification'));--> statement-breakpoint
ALTER TABLE "model_calls" ADD CONSTRAINT "model_calls_status_check" CHECK ("status" in ('passed','failed','cancelled','timeout'));--> statement-breakpoint
ALTER TABLE "model_calls" ADD CONSTRAINT "model_calls_metrics_check" CHECK ("durationMs" >= 0 and "retryCount" >= 0 and "failedAttempts" >= 0 and ("inputTokens" is null or "inputTokens" >= 0) and ("outputTokens" is null or "outputTokens" >= 0));--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_attempts_check" CHECK ("attempts" >= 0);--> statement-breakpoint
ALTER TABLE "recording_versions" ADD CONSTRAINT "recording_versions_platform_check" CHECK ("platform" in ('web','android','ios'));--> statement-breakpoint
ALTER TABLE "recording_versions" ADD CONSTRAINT "recording_versions_schema_version_check" CHECK ("schemaVersion" > 0);--> statement-breakpoint
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_duration_check" CHECK ("durationMs" is null or "durationMs" >= 0);