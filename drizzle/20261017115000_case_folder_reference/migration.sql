ALTER TABLE "test_cases" ADD COLUMN "folderId" uuid;--> statement-breakpoint
ALTER TABLE "test_cases" ADD COLUMN "folderPosition" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "test_cases_folder_idx" ON "test_cases" ("folderId","folderPosition");--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_folderId_test_suites_id_fkey" FOREIGN KEY ("folderId") REFERENCES "test_suites"("id") ON DELETE SET NULL;
--> statement-breakpoint
UPDATE "test_cases" AS t
SET "folderId" = m."suiteId", "folderPosition" = m."position"
FROM "suite_cases" AS m WHERE t."id" = m."testId";
--> statement-breakpoint
DROP TABLE "suite_cases";
