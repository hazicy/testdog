ALTER TABLE "run_artifacts" ADD CONSTRAINT "run_artifacts_kind_check" CHECK ("kind" in ('screenshot','video','trace'));--> statement-breakpoint
ALTER TABLE "run_artifacts" ADD CONSTRAINT "run_artifacts_stage_check" CHECK ("stage" in ('before','after','live','final'));--> statement-breakpoint
ALTER TABLE "run_artifacts" ADD CONSTRAINT "run_artifacts_size_check" CHECK ("size" >= 0 and "elapsedMs" >= 0);--> statement-breakpoint
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_sequence_check" CHECK ("sequence" > 0);--> statement-breakpoint
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_status_check" CHECK ("status" in ('running','passed','failed'));--> statement-breakpoint
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_kind_check" CHECK ("kind" in ('navigate','action','assertion','wait','branch'));--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_status_check" CHECK ("status" in ('running','passed','failed','cancelled'));--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_mode_check" CHECK ("mode" in ('record','replay'));--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_duration_check" CHECK ("durationMs" is null or "durationMs" >= 0);