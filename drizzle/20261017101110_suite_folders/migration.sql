ALTER TABLE "test_suites" ADD COLUMN "parentId" uuid;--> statement-breakpoint
ALTER TABLE "test_suites" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "test_suites_parent_idx" ON "test_suites" ("parentId","position");--> statement-breakpoint
ALTER TABLE "test_suites" ADD CONSTRAINT "test_suites_parentId_test_suites_id_fkey" FOREIGN KEY ("parentId") REFERENCES "test_suites"("id") ON DELETE CASCADE;