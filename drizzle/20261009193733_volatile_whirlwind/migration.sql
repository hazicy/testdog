CREATE TABLE "automation_builds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"platform" text NOT NULL,
	"appId" text NOT NULL,
	"sha256" text NOT NULL,
	"path" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
