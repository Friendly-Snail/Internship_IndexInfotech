CREATE TABLE "encounter_area" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"location_name" varchar(255) NOT NULL,
	"region_name" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pokemon_encounter" (
	"pokemon_id" integer NOT NULL,
	"area_id" integer NOT NULL,
	CONSTRAINT "pokemon_encounter_pokemon_id_area_id_pk" PRIMARY KEY("pokemon_id","area_id")
);
--> statement-breakpoint
CREATE TABLE "region" (
	"name" varchar(100) PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "regions_cached_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "encounter_area" ADD CONSTRAINT "encounter_area_region_name_region_name_fk" FOREIGN KEY ("region_name") REFERENCES "public"."region"("name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pokemon_encounter" ADD CONSTRAINT "pokemon_encounter_pokemon_id_pokemon_id_fk" FOREIGN KEY ("pokemon_id") REFERENCES "public"."pokemon"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pokemon_encounter" ADD CONSTRAINT "pokemon_encounter_area_id_encounter_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."encounter_area"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "encounter_area_region_idx" ON "encounter_area" USING btree ("region_name");--> statement-breakpoint
CREATE INDEX "pokemon_encounter_area_idx" ON "pokemon_encounter" USING btree ("area_id");