CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"panel_id" uuid NOT NULL,
	"server_id" text DEFAULT '*' NOT NULL,
	"server_name" text,
	"events" text[] NOT NULL,
	"threshold" integer DEFAULT 90 NOT NULL,
	"mention_role_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "console_threads" (
	"thread_id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"panel_id" uuid NOT NULL,
	"server_id" text NOT NULL,
	"server_name" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text NOT NULL,
	"panel_id" uuid NOT NULL,
	"server_id" text DEFAULT '*' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "status_boards_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_panel_id_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."panels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "console_threads" ADD CONSTRAINT "console_threads_panel_id_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."panels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_boards" ADD CONSTRAINT "status_boards_panel_id_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."panels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_rules_guild_idx" ON "alert_rules" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "console_threads_guild_idx" ON "console_threads" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "status_boards_guild_idx" ON "status_boards" USING btree ("guild_id");