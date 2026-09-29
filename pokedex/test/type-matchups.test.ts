import { describe, expect, test } from "bun:test";
import { battleBonus, incomingMultiplier, typeMultiplierAgainstTypes } from "../src/type-matchups";

const relation = (from: { double?: string[]; half?: string[]; none?: string[] }) => ({
  damage_relations: {
    double_damage_from: (from.double ?? []).map((name) => ({ name })),
    half_damage_from: (from.half ?? []).map((name) => ({ name })),
    no_damage_from: (from.none ?? []).map((name) => ({ name })),
  },
});

describe("type matchups used by fights and details", () => {
  test("two weaknesses multiply to four, while a weakness and resistance cancel", () => {
    expect(
      incomingMultiplier("electric", [
        relation({ double: ["electric"] }),
        relation({ double: ["electric"] }),
      ]),
    ).toBe(4);
    expect(
      incomingMultiplier("water", [relation({ double: ["water"] }), relation({ half: ["water"] })]),
    ).toBe(1);
  });

  test("immunity wins over a weakness and neutral pairs stay neutral", () => {
    expect(
      incomingMultiplier("ground", [
        relation({ double: ["ground"] }),
        relation({ none: ["ground"] }),
      ]),
    ).toBe(0);
    expect(incomingMultiplier("fire", [relation({}), relation({})])).toBe(1);
  });

  test("a dual-type attacker chooses its best type and applies the same bonus", () => {
    const attacker = {
      types: ["fire", "flying"],
      matchups: { fire: { grass: 2 }, flying: { grass: 2, rock: 0.5 } },
    };
    expect(typeMultiplierAgainstTypes(attacker, ["grass"])).toBe(2);
    expect(typeMultiplierAgainstTypes(attacker, ["grass", "rock"])).toBe(2);
    expect(battleBonus(2)).toBe(50);
    expect(battleBonus(0)).toBe(-100);
  });
});
