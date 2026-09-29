-- convert the old times-100 values while changing each column to a decimal
-- null values in older history rows stay null
ALTER TABLE "battle_history" ALTER COLUMN "pokemon1_multiplier" SET DATA TYPE numeric(5, 2) USING ("pokemon1_multiplier"::numeric / 100)::numeric(5, 2);--> statement-breakpoint
ALTER TABLE "battle_history" ALTER COLUMN "pokemon2_multiplier" SET DATA TYPE numeric(5, 2) USING ("pokemon2_multiplier"::numeric / 100)::numeric(5, 2);--> statement-breakpoint
ALTER TABLE "battle_participant" ALTER COLUMN "type_multiplier" SET DATA TYPE numeric(5, 2) USING ("type_multiplier"::numeric / 100)::numeric(5, 2);--> statement-breakpoint
ALTER TABLE "type_matchup" ALTER COLUMN "multiplier" SET DATA TYPE numeric(5, 2) USING ("multiplier"::numeric / 100)::numeric(5, 2);
