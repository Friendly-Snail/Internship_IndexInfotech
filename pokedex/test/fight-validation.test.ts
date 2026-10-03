import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { fightBodySchema } from "../src/validation/fight";

// exercise the same hono json middleware without a database or pokeapi request
const app = new Hono();
app.post(
  "/fight",
  zValidator("json", fightBodySchema, (result, c) => {
    if (!result.success) return c.json({ error: "Invalid fight request" }, 400);
  }),
  (c) => c.json(c.req.valid("json")),
);

/**
 * Send a JSON fight request to the isolated test application.
 *
 * @param body - The request body, including invalid cases under test.
 * @returns The response from POST /fight.
 */
async function post(body: unknown): Promise<Response> {
  return app.request("/fight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("fight json validation", () => {
  test("accepts and normalizes equal teams of up to four", async () => {
    const response = await post({
      team1: [" PIKACHU ", "bulbasaur", "3", "mr-mime"],
      team2: ["squirtle", "charmander", "geodude", "pidgey"],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      team1: ["pikachu", "bulbasaur", "3", "mr-mime"],
      team2: ["squirtle", "charmander", "geodude", "pidgey"],
    });
  });

  test("accepts a 1v1 battle as two teams of one", async () => {
    const response = await post({ team1: ["squirtle"], team2: ["charmander"] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ team1: ["squirtle"], team2: ["charmander"] });
  });

  test("rejects the obsolete individual-Pokemon request shape", async () => {
    expect((await post({ pokemon1: "squirtle", pokemon2: "charmander" })).status).toBe(400);
  });

  test("accepts unequal teams in either direction", async () => {
    for (const [team1, team2] of [
      [["pikachu"], ["squirtle", "charmander", "bulbasaur"]],
      [
        ["pikachu", "eevee"],
        ["squirtle", "charmander", "bulbasaur", "pidgey"],
      ],
      [["squirtle", "charmander", "bulbasaur"], ["pikachu"]],
    ]) {
      expect((await post({ team1, team2 })).status).toBe(200);
    }
  });

  test("rejects missing, empty, and oversized teams", async () => {
    for (const body of [
      { team1: ["pikachu"] },
      { team1: [], team2: [] },
      { team1: Array(5).fill("pikachu"), team2: Array(5).fill("squirtle") },
    ]) {
      expect((await post(body)).status).toBe(400);
    }
  });

  test("rejects invalid identifiers before any pokemon lookup", async () => {
    for (const bad of ["", "not a name!", "0", "-1", "01", "9007199254740992", 25]) {
      expect((await post({ team1: [bad], team2: ["pikachu"] })).status).toBe(400);
    }
  });

  test("rejects malformed json", async () => {
    const response = await app.request("/fight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(response.status).toBe(400);
  });
});
