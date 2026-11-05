CREATE TABLE "events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"space_id" uuid,
	"type" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"parent_id" uuid,
	"type" text DEFAULT 'task' NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"state" text DEFAULT 'unstarted' NOT NULL,
	"column_id" uuid NOT NULL,
	"position" text COLLATE "C" NOT NULL,
	"lead_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_space_id_unique" UNIQUE("space_id","id"),
	CONSTRAINT "items_type_check" CHECK ("items"."type" in ('project', 'epic', 'story', 'task')),
	CONSTRAINT "items_state_check" CHECK ("items"."state" in ('unstarted', 'started', 'done', 'discarded')),
	CONSTRAINT "items_version_check" CHECK ("items"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "actors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "actors_kind_check" CHECK ("actors"."kind" in ('human', 'agent'))
);
--> statement-breakpoint
CREATE TABLE "columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"state" text NOT NULL,
	"position" text COLLATE "C" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "columns_space_name_unique" UNIQUE("space_id","name"),
	CONSTRAINT "columns_space_id_unique" UNIQUE("space_id","id"),
	CONSTRAINT "columns_space_id_state_unique" UNIQUE("space_id","id","state"),
	CONSTRAINT "columns_state_check" CHECK ("columns"."state" in ('unstarted', 'started', 'done', 'discarded'))
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"space_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_space_id_actor_id_pk" PRIMARY KEY("space_id","actor_id")
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spaces_type_check" CHECK ("spaces"."type" in ('personal', 'organization'))
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_lead_id_actors_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_parent_same_space_fk" FOREIGN KEY ("space_id","parent_id") REFERENCES "public"."items"("space_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_column_same_space_and_state_fk" FOREIGN KEY ("space_id","column_id","state") REFERENCES "public"."columns"("space_id","id","state") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "columns" ADD CONSTRAINT "columns_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_target_idx" ON "events" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "events_space_id_idx" ON "events" USING btree ("space_id","id");--> statement-breakpoint
CREATE INDEX "items_space_idx" ON "items" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "items_parent_position_idx" ON "items" USING btree ("parent_id","position");--> statement-breakpoint
CREATE INDEX "items_column_position_idx" ON "items" USING btree ("space_id","column_id","position");--> statement-breakpoint
CREATE INDEX "items_lead_idx" ON "items" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "columns_space_position_idx" ON "columns" USING btree ("space_id","position");--> statement-breakpoint
CREATE INDEX "memberships_actor_idx" ON "memberships" USING btree ("actor_id");