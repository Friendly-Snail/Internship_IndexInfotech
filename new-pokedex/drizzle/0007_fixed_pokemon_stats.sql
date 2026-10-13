-- Add nullable columns first so existing Pokemon can be backfilled.
--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "hp" integer;
--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "attack" integer;
--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "defense" integer;
--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "special_attack" integer;
--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "special_defense" integer;
--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "speed" integer;
--> statement-breakpoint
-- Copy by stat name, never by row order. Missing stats remain NULL.
UPDATE "pokemon" AS p SET
  "hp" = (SELECT s."base_stat" FROM "pokemon_stat" AS s WHERE s."pokemon_id" = p."id" AND s."stat_name" = 'hp'),
  "attack" = (SELECT s."base_stat" FROM "pokemon_stat" AS s WHERE s."pokemon_id" = p."id" AND s."stat_name" = 'attack'),
  "defense" = (SELECT s."base_stat" FROM "pokemon_stat" AS s WHERE s."pokemon_id" = p."id" AND s."stat_name" = 'defense'),
  "special_attack" = (SELECT s."base_stat" FROM "pokemon_stat" AS s WHERE s."pokemon_id" = p."id" AND s."stat_name" = 'special-attack'),
  "special_defense" = (SELECT s."base_stat" FROM "pokemon_stat" AS s WHERE s."pokemon_id" = p."id" AND s."stat_name" = 'special-defense'),
  "speed" = (SELECT s."base_stat" FROM "pokemon_stat" AS s WHERE s."pokemon_id" = p."id" AND s."stat_name" = 'speed');
--> statement-breakpoint
-- NOT NULL checks fail safely if an existing Pokemon has incomplete stats.
-- The PostgreSQL migration transaction rolls back on failure.
--> statement-breakpoint
ALTER TABLE "pokemon" ALTER COLUMN "hp" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "pokemon" ALTER COLUMN "attack" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "pokemon" ALTER COLUMN "defense" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "pokemon" ALTER COLUMN "special_attack" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "pokemon" ALTER COLUMN "special_defense" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "pokemon" ALTER COLUMN "speed" SET NOT NULL;
--> statement-breakpoint
-- Remove the old table only after every required stat was copied successfully.
DROP TABLE "pokemon_stat";
