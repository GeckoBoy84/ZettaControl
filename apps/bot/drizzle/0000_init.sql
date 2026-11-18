CREATE TABLE "panels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"panel_username" text NOT NULL,
	"allowed_role_ids" text[] DEFAULT '{}' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "panels_owner_name_idx" ON "panels" USING btree ("scope","owner_id","name");--> statement-breakpoint
CREATE INDEX "panels_owner_idx" ON "panels" USING btree ("scope","owner_id");