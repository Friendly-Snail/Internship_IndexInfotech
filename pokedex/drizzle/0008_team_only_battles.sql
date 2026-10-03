-- Legacy records lack historical base-stat and speed snapshots. Do not fabricate them.
ALTER TABLE battle_participant ALTER COLUMN total_stats DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE battle_participant ALTER COLUMN speed DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE battle_participant ALTER COLUMN type_multiplier DROP NOT NULL;
--> statement-breakpoint
-- Preserve each legacy Pokemon as position 1 on its team.
INSERT INTO battle_participant (battle_id, pokemon_id, team_number, position, battle_score, total_stats, speed, type_multiplier)
SELECT b.id, b.pokemon1_id, 1, 1, b.pokemon1_score, NULL, NULL, b.pokemon1_multiplier
FROM battle_history b
WHERE b.pokemon1_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM battle_participant p WHERE p.battle_id = b.id AND p.team_number = 1);
--> statement-breakpoint
-- Preserve each legacy Pokemon as position 1 on its team.
INSERT INTO battle_participant (battle_id, pokemon_id, team_number, position, battle_score, total_stats, speed, type_multiplier)
SELECT b.id, b.pokemon2_id, 2, 1, b.pokemon2_score, NULL, NULL, b.pokemon2_multiplier
FROM battle_history b
WHERE b.pokemon2_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM battle_participant p WHERE p.battle_id = b.id AND p.team_number = 2);
--> statement-breakpoint
UPDATE battle_history SET team1_score = COALESCE(team1_score, pokemon1_score), team2_score = COALESCE(team2_score, pokemon2_score);
--> statement-breakpoint
-- Refuse incomplete history instead of discarding it.
DO $$ BEGIN
IF EXISTS (SELECT 1 FROM battle_history b WHERE NOT EXISTS (SELECT 1 FROM battle_participant p WHERE p.battle_id=b.id AND p.team_number=1) OR NOT EXISTS (SELECT 1 FROM battle_participant p WHERE p.battle_id=b.id AND p.team_number=2)) THEN
RAISE EXCEPTION 'Battle history has incomplete teams; repair the records before migrating.';
END IF;
END $$;
--> statement-breakpoint
ALTER TABLE battle_history ALTER COLUMN team1_score SET NOT NULL;
--> statement-breakpoint
ALTER TABLE battle_history ALTER COLUMN team2_score SET NOT NULL;
--> statement-breakpoint
ALTER TABLE battle_history ALTER COLUMN result TYPE text USING result::text;
--> statement-breakpoint
UPDATE battle_history SET result = CASE result WHEN 'POKEMON1_WIN' THEN 'TEAM1_WIN' WHEN 'POKEMON2_WIN' THEN 'TEAM2_WIN' ELSE result END;
--> statement-breakpoint
DROP TYPE battle_result;
--> statement-breakpoint
CREATE TYPE battle_result AS ENUM ('TIE', 'TEAM1_WIN', 'TEAM2_WIN');
--> statement-breakpoint
ALTER TABLE battle_history ALTER COLUMN result TYPE battle_result USING result::battle_result;
--> statement-breakpoint
ALTER TABLE battle_history DROP COLUMN pokemon1_id;
--> statement-breakpoint
ALTER TABLE battle_history DROP COLUMN pokemon2_id;
--> statement-breakpoint
ALTER TABLE battle_history DROP COLUMN pokemon1_score;
--> statement-breakpoint
ALTER TABLE battle_history DROP COLUMN pokemon2_score;
--> statement-breakpoint
ALTER TABLE battle_history DROP COLUMN pokemon1_multiplier;
--> statement-breakpoint
ALTER TABLE battle_history DROP COLUMN pokemon2_multiplier;
