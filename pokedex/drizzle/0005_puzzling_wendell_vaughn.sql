-- check that every cached pokemon has usable normalized rows before removing the old json
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "pokemon" p
    WHERE NOT EXISTS (SELECT 1 FROM "pokemon_stat" s WHERE s."pokemon_id" = p."id")
       OR NOT EXISTS (SELECT 1 FROM "pokemon_type" t WHERE t."pokemon_id" = p."id")
       OR EXISTS (
         SELECT 1 FROM "pokemon_type" t
         WHERE t."pokemon_id" = p."id"
           AND NOT EXISTS (SELECT 1 FROM "type_matchup" m WHERE m."attacking_type" = t."type_name")
       )
  ) THEN
    RAISE EXCEPTION 'Cannot drop pokemon JSON: cached pokemon is missing normalized stats, types, or matchups';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "pokemon" DROP COLUMN "stats";--> statement-breakpoint
ALTER TABLE "pokemon" DROP COLUMN "types";--> statement-breakpoint
ALTER TABLE "pokemon" DROP COLUMN "type_relations";
