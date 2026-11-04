CREATE TYPE "public"."item_type" AS ENUM('project', 'epic', 'story', 'task');--> statement-breakpoint
CREATE TYPE "public"."actor_kind" AS ENUM('human', 'agent');--> statement-breakpoint
CREATE TYPE "public"."item_state" AS ENUM('unstarted', 'started', 'done', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."space_type" AS ENUM('personal', 'organization');--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"space_id" uuid,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"type" text NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"parent_id" uuid,
	"type" "item_type" DEFAULT 'task' NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"state" "item_state" NOT NULL,
	"column_id" uuid NOT NULL,
	"position" text COLLATE "C" NOT NULL,
	"lead_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_space_id_key" UNIQUE("space_id","id"),
	CONSTRAINT "items_title_not_blank" CHECK (btrim("items"."title") <> ''),
	CONSTRAINT "items_not_own_parent" CHECK ("items"."parent_id" <> "items"."id")
);
--> statement-breakpoint
CREATE TABLE "actors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "actor_kind" NOT NULL,
	CONSTRAINT "actors_name_not_blank" CHECK (btrim("actors"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"state" "item_state" NOT NULL,
	"position" text COLLATE "C" NOT NULL,
	CONSTRAINT "columns_space_id_id_state_key" UNIQUE("space_id","id","state"),
	CONSTRAINT "columns_name_not_blank" CHECK (btrim("columns"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"space_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	CONSTRAINT "memberships_space_id_actor_id_pk" PRIMARY KEY("space_id","actor_id")
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "space_type" NOT NULL,
	CONSTRAINT "spaces_name_not_blank" CHECK (btrim("spaces"."name") <> '')
);
--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_parent_fk" FOREIGN KEY ("space_id","parent_id") REFERENCES "public"."items"("space_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_column_fk" FOREIGN KEY ("space_id","column_id","state") REFERENCES "public"."columns"("space_id","id","state") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_lead_fk" FOREIGN KEY ("space_id","lead_id") REFERENCES "public"."memberships"("space_id","actor_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "columns" ADD CONSTRAINT "columns_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_target_idx" ON "events" USING btree ("target_kind","target_id","id");--> statement-breakpoint
CREATE INDEX "events_space_idx" ON "events" USING btree ("space_id","id");--> statement-breakpoint
CREATE INDEX "items_siblings_idx" ON "items" USING btree ("space_id","parent_id","position","id");--> statement-breakpoint
CREATE INDEX "items_column_idx" ON "items" USING btree ("space_id","column_id","state");--> statement-breakpoint
CREATE INDEX "memberships_actor_idx" ON "memberships" USING btree ("actor_id");