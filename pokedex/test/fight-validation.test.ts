import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { fightBodySchema } from "../src/validation/fight";

// exercise the same hono json middleware without a database or pokeapi request
const app = new Hono();
app.post("/fight", zValidator("json", fightBodySchema, (result, c) => {
  if (!result.success) return c.json({ error: "Invalid fight request" }, 400);
}), (c) => c.json(c.req.valid("json")));

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

  test("rejects missing, empty, unequal, and oversized teams", async () => {
    for (const body of [
      { team1: ["pikachu"] },
      { team1: [], team2: [] },
      { team1: ["pikachu"], team2: ["squirtle", "charmander"] },
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
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
    });
    expect(response.status).toBe(400);
  });
});
