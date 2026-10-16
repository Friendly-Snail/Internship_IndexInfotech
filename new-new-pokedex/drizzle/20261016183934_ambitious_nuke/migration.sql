CREATE TYPE "battle_result" AS ENUM('TIE', 'TEAM1_WIN', 'TEAM2_WIN');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battle_history" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "battle_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"result" "battle_result" NOT NULL,
	"decided_by" varchar(100) NOT NULL,
	"team1_score" integer NOT NULL,
	"team2_score" integer NOT NULL,
	"fought_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battle_participant" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "battle_participant_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"battle_id" integer NOT NULL,
	"pokemon_id" integer NOT NULL,
	"team_number" integer NOT NULL,
	"position" integer NOT NULL,
	"battle_score" integer NOT NULL,
	"total_stats" integer,
	"speed" integer,
	"type_multiplier" numeric(5,2),
	CONSTRAINT "battle_participant_slot_unique" UNIQUE("battle_id","team_number","position"),
	CONSTRAINT "battle_participant_team_check" CHECK ("team_number" IN (1, 2)),
	CONSTRAINT "battle_participant_position_check" CHECK ("position" BETWEEN 1 AND 4)
);
--> statement-breakpoint
CREATE TABLE "encounter_area" (
	"id" integer PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"location_name" varchar(255) NOT NULL,
	"region_name" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pokedex" (
	"user_id" text,
	"pokemon_id" integer,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pokedex_pkey" PRIMARY KEY("user_id","pokemon_id")
);
--> statement-breakpoint
CREATE TABLE "pokemon" (
	"id" integer PRIMARY KEY,
	"name" varchar(255) NOT NULL UNIQUE,
	"hp" integer NOT NULL,
	"attack" integer NOT NULL,
	"defense" integer NOT NULL,
	"special_attack" integer NOT NULL,
	"special_defense" integer NOT NULL,
	"speed" integer NOT NULL,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"regions_cached_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pokemon_element_type" (
	"name" varchar(100) PRIMARY KEY
);
--> statement-breakpoint
CREATE TABLE "pokemon_encounter" (
	"pokemon_id" integer,
	"area_id" integer,
	CONSTRAINT "pokemon_encounter_pkey" PRIMARY KEY("pokemon_id","area_id")
);
--> statement-breakpoint
CREATE TABLE "pokemon_type" (
	"pokemon_id" integer,
	"type_name" varchar(100),
	"slot" integer NOT NULL,
	CONSTRAINT "pokemon_type_pkey" PRIMARY KEY("pokemon_id","type_name"),
	CONSTRAINT "pokemon_type_slot_unique" UNIQUE("pokemon_id","slot")
);
--> statement-breakpoint
CREATE TABLE "region" (
	"name" varchar(100) PRIMARY KEY
);
--> statement-breakpoint
CREATE TABLE "resource_list_cache" (
	"resource" varchar(100) PRIMARY KEY,
	"cached_at" timestamp with time zone NOT NULL,
	CONSTRAINT "resource_list_cache_resource_check" CHECK ("resource" IN ('type', 'region'))
);
--> statement-breakpoint
CREATE TABLE "type_matchup" (
	"attacking_type" varchar(100),
	"defending_type" varchar(100),
	"multiplier" numeric(5,2) NOT NULL,
	CONSTRAINT "type_matchup_pkey" PRIMARY KEY("attacking_type","defending_type")
);
--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
CREATE INDEX "battle_history_fought_at_idx" ON "battle_history" ("fought_at");--> statement-breakpoint
CREATE INDEX "battle_participant_battle_idx" ON "battle_participant" ("battle_id");--> statement-breakpoint
CREATE INDEX "encounter_area_region_idx" ON "encounter_area" ("region_name");--> statement-breakpoint
CREATE INDEX "pokedex_pokemon_id_idx" ON "pokedex" ("pokemon_id");--> statement-breakpoint
CREATE INDEX "pokemon_encounter_area_idx" ON "pokemon_encounter" ("area_id");--> statement-breakpoint
CREATE INDEX "pokemon_type_name_idx" ON "pokemon_type" ("type_name");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "battle_participant" ADD CONSTRAINT "battle_participant_battle_id_battle_history_id_fkey" FOREIGN KEY ("battle_id") REFERENCES "battle_history"("id");--> statement-breakpoint
ALTER TABLE "battle_participant" ADD CONSTRAINT "battle_participant_pokemon_id_pokemon_id_fkey" FOREIGN KEY ("pokemon_id") REFERENCES "pokemon"("id");--> statement-breakpoint
ALTER TABLE "encounter_area" ADD CONSTRAINT "encounter_area_region_name_region_name_fkey" FOREIGN KEY ("region_name") REFERENCES "region"("name");--> statement-breakpoint
ALTER TABLE "pokedex" ADD CONSTRAINT "pokedex_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pokedex" ADD CONSTRAINT "pokedex_pokemon_id_pokemon_id_fkey" FOREIGN KEY ("pokemon_id") REFERENCES "pokemon"("id");--> statement-breakpoint
ALTER TABLE "pokemon_encounter" ADD CONSTRAINT "pokemon_encounter_pokemon_id_pokemon_id_fkey" FOREIGN KEY ("pokemon_id") REFERENCES "pokemon"("id");--> statement-breakpoint
ALTER TABLE "pokemon_encounter" ADD CONSTRAINT "pokemon_encounter_area_id_encounter_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "encounter_area"("id");--> statement-breakpoint
ALTER TABLE "pokemon_type" ADD CONSTRAINT "pokemon_type_pokemon_id_pokemon_id_fkey" FOREIGN KEY ("pokemon_id") REFERENCES "pokemon"("id");--> statement-breakpoint
ALTER TABLE "pokemon_type" ADD CONSTRAINT "pokemon_type_type_name_pokemon_element_type_name_fkey" FOREIGN KEY ("type_name") REFERENCES "pokemon_element_type"("name");--> statement-breakpoint
ALTER TABLE "type_matchup" ADD CONSTRAINT "type_matchup_attacking_type_pokemon_element_type_name_fkey" FOREIGN KEY ("attacking_type") REFERENCES "pokemon_element_type"("name");--> statement-breakpoint
ALTER TABLE "type_matchup" ADD CONSTRAINT "type_matchup_defending_type_pokemon_element_type_name_fkey" FOREIGN KEY ("defending_type") REFERENCES "pokemon_element_type"("name");