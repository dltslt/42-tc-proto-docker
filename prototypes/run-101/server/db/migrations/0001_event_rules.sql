-- Hand-written: drizzle-kit cannot generate these. Never use `drizzle-kit push`, which would drop them.

-- core owns the events table and must not import workspace, so these keys are not in its schema file.
ALTER TABLE "events" ADD CONSTRAINT "events_space_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id");--> statement-breakpoint
CREATE INDEX "events_actor_idx" ON "events" USING btree ("actor_id");--> statement-breakpoint

-- Append-only: the database itself refuses to change or remove an event, whatever the application does.
CREATE FUNCTION "events_reject_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'events are append-only: % is not allowed', TG_OP;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "events_append_only" BEFORE UPDATE OR DELETE OR TRUNCATE ON "events"
  FOR EACH STATEMENT EXECUTE FUNCTION "events_reject_change"();
