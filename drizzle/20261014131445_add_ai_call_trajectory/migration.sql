ALTER TABLE "model_calls" ADD COLUMN "trace" jsonb;--> statement-breakpoint
ALTER TABLE "run_steps" ADD COLUMN "modelCallId" uuid;--> statement-breakpoint
ALTER TABLE "run_steps" ADD COLUMN "toolCallId" text;--> statement-breakpoint
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_modelCallId_model_calls_id_fkey" FOREIGN KEY ("modelCallId") REFERENCES "model_calls"("id") ON DELETE SET NULL;