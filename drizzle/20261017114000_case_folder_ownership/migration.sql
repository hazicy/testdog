-- Keep the first existing location when a case belonged to multiple suites.
DELETE FROM suite_cases a USING suite_cases b
WHERE a."testId" = b."testId" AND (a.position, a."suiteId") > (b.position, b."suiteId");
--> statement-breakpoint
DROP INDEX "suite_cases_test_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "suite_cases_test_idx" ON "suite_cases" ("testId");
