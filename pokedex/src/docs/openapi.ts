import { z } from "zod";
import type {
  OpenAPIObject,
  SchemaObject,
  ReferenceObject,
  OperationObject,
  ParameterObject,
  ResponseObject,
} from "openapi3-ts/oas31";
import type { Auth } from "../auth";
import { fightBodySchema, pokemonIdentifier } from "../validation/fight";
import { addPokemonBody, removePokemonParams } from "../routes/pokedex";

type Schema = SchemaObject | ReferenceObject;
/**
 * Reference a reusable schema in the document components.
 *
 * @param name - The component schema name.
 * @returns A local OpenAPI schema reference.
 */
const ref = (name: string): ReferenceObject => ({ $ref: `#/components/schemas/${name}` });
const text: SchemaObject = { type: "string" };
const integer: SchemaObject = { type: "integer" };
const number: SchemaObject = { type: "number" };
const timestamp: SchemaObject = { type: "string", format: "date-time" };
/**
 * Describe an array with a shared schema for its items.
 *
 * @param items - Schema accepted for each item.
 * @returns The array schema.
 */
const array = (items: Schema): SchemaObject => ({ type: "array", items });
/**
 * Describe an object and its required properties.
 *
 * @param properties - Schemas keyed by property name.
 * @param required - Required property names; defaults to all declared properties.
 * @returns The object schema.
 */
const object = (
  properties: Record<string, Schema>,
  required = Object.keys(properties),
): SchemaObject => ({ type: "object", properties, required });
/**
 * Allow a schema's value or null in OpenAPI 3.1.
 *
 * @param schema - The non-null value schema.
 * @returns A schema accepting either the supplied value or null.
 */
const nullable = (schema: Schema): SchemaObject => ({ anyOf: [schema, { type: "null" }] });
/**
 * Describe a JSON response with its body schema.
 *
 * @param schema - Schema of the response body.
 * @param description - Meaning of the HTTP response.
 * @returns The application/json response definition.
 */
const json = (schema: Schema, description: string): ResponseObject => ({
  description,
  content: { "application/json": { schema } },
});
/**
 * Describe an application error using the shared error-body schema.
 *
 * @param description - Meaning of the error response.
 * @returns The JSON error response definition.
 */
const error = (description: string) => json(ref("Error"), description);
const databaseErrors = { "500": error("Database or unexpected server failure.") };
const upstreamErrors = {
  ...databaseErrors,
  "404": error("Requested resource was not found in PokeAPI."),
  "502": error("PokeAPI is unavailable or returned an upstream error."),
  "504": error("PokeAPI request timed out."),
};
const protectedErrors = {
  ...databaseErrors,
  "401": error("Session cookie is missing, invalid, expired, or revoked."),
};
const malformedJSON = { "text/plain": { schema: text, example: "Malformed JSON in request body" } };

/**
 * Convert a Zod input shape into an OpenAPI-compatible schema.
 *
 * @param schema - The runtime input validator.
 * @returns JSON Schema without its top-level dialect declaration; normalization remains a runtime check.
 */
function input(schema: z.ZodType): SchemaObject {
  const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema, { io: "input" });
  return jsonSchema as SchemaObject;
}

const schemas: Record<string, SchemaObject> = {
  Error: object({ error: text }),
  FightValidationError: object({
    error: text,
    issues: array(object({ path: text, message: text })),
  }),
  ZodValidationError: object({
    success: { type: "boolean", const: false },
    error: object({ name: text, message: text }),
  }),
  PokemonSummary: object({ id: { type: "integer", minimum: 1 }, name: text }),
  Stats: object({
    hp: integer,
    attack: integer,
    defense: integer,
    "special-attack": integer,
    "special-defense": integer,
    speed: integer,
  }),
  FightRequest: {
    ...input(fightBodySchema),
    description:
      "Each team has 1–4 members; unequal sizes are allowed. All resolved Pokemon IDs must be distinct across both teams, even when a name and ID identify the same Pokemon. Identifiers are trimmed/lowercased. Safe-integer and resolved-ID checks are enforced at runtime.",
  },
  AddPokemonRequest: {
    ...input(addPokemonBody),
    description:
      "Only pokemon is accepted. Use a name or string ID. Identity comes from the session; userId is rejected. Numeric IDs must be safe integers.",
  },
  FightMember: object({
    position: integer,
    id: integer,
    name: text,
    result: { type: "string", enum: ["WIN", "LOSE", "TIE"] },
    types: array(text),
    totalStats: integer,
    typeMultiplier: number,
    battleScore: integer,
  }),
  FightTeam: object({ score: integer, pokemon: array(ref("FightMember")) }),
  BattleResult: { type: "string", enum: ["TEAM1_WIN", "TEAM2_WIN", "TIE"] },
  FightResponse: object({
    battleId: integer,
    result: ref("BattleResult"),
    decidedBy: text,
    team1: ref("FightTeam"),
    team2: ref("FightTeam"),
    note: text,
  }),
  HistoryMember: object({
    position: integer,
    id: integer,
    name: text,
    battleScore: integer,
    totalStats: nullable(integer),
    speed: nullable(integer),
    typeMultiplier: nullable(number),
  }),
  HistoryTeam: object({ score: integer, pokemon: array(ref("HistoryMember")) }),
  BattleHistory: object({
    id: integer,
    foughtAt: {
      type: "integer",
      format: "int64",
      description: "Whole Unix seconds since 1970-01-01T00:00:00Z, rounded down.",
      example: 1_000_000_000,
    },
    result: ref("BattleResult"),
    decidedBy: text,
    team1: ref("HistoryTeam"),
    team2: ref("HistoryTeam"),
  }),
  BattlesResponse: object({ count: integer, battles: array(ref("BattleHistory")) }),
  TypeSearchResponse: object({
    type: text,
    count: integer,
    pokemon: array(text),
    scope: { type: "string", const: "cached pokemon" },
  }),
  RegionSearchResponse: object({
    region: text,
    count: integer,
    pokemon: array(text),
    scope: { type: "string", const: "cached pokemon with PokeAPI wild encounters" },
  }),
  PokemonRegionsResponse: object({ pokemon: text, regions: array(text) }),
  TypeEffectiveness: object({ type: text, multiplier: number }),
  AttackExample: object({
    type: text,
    multiplier: number,
    bonus: integer,
    potentialScore: integer,
  }),
  PokemonDetail: object({
    id: integer,
    name: text,
    stats: ref("Stats"),
    totalStats: integer,
    types: array(text),
    defense: object({
      weakTo: array(ref("TypeEffectiveness")),
      resists: array(ref("TypeEffectiveness")),
      immuneTo: array(ref("TypeEffectiveness")),
    }),
    attackAgainstSingleType: array(ref("AttackExample")),
    regions: array(text),
    regionsComplete: { type: "boolean" },
    note: text,
  }),
  TypesResponse: object({
    count: integer,
    types: array(text),
    source: { type: "string", const: "database" },
  }),
  RegionsResponse: object({
    count: integer,
    regions: array(text),
    source: { type: "string", const: "database" },
  }),
  CurrentTrainer: object({
    user: object({
      id: text,
      name: text,
      email: { type: "string", format: "email" },
      emailVerified: { type: "boolean" },
    }),
    session: object({ id: text, expiresAt: timestamp }),
  }),
  PokedexEntry: object({ pokemon: ref("PokemonSummary"), addedAt: timestamp }),
  PokedexResponse: object({ count: integer, entries: array(ref("PokedexEntry")) }),
  RemovePokemonResponse: object({ removed: { type: "boolean", const: true }, pokemonId: integer }),
  Discovery: object({ message: text, endpoints: { type: "object", additionalProperties: text } }),
  AuthError: object({ message: text, code: text }, ["message"]),
};

/**
 * Recursively convert legacy nullable metadata into OpenAPI JSON Schema
 *
 * @param value - Better Auth metadata, including nested objects and arrays
 * @returns A converted copy; primitive values are retained
 */
function normalizeAuthMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeAuthMetadata);
  if (!value || typeof value !== "object") return value;
  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key !== "nullable") copy[key] = normalizeAuthMetadata(item);
  }
  if ("nullable" in value && value.nullable === true) {
    if (typeof copy.type === "string") copy.type = [copy.type, "null"];
    else return { anyOf: [copy, { type: "null" }] };
  }
  return copy;
}

/**
 * Build the complete API contract using runtime inputs and Better Auth metadata
 *
 * @param auth - Better Auth instance supplying the application origin, cookie name, and auth schemas
 * @returns An OpenAPI document without querying Pokemon data or PostgreSQL
 */
export async function createOpenApiDocument(auth: Auth): Promise<OpenAPIObject> {
  const baseURL = auth.options.baseURL;
  const cookieName = (await auth.$context).authCookies.sessionToken.name;
  const origin: ParameterObject = {
    name: "Origin",
    in: "header",
    required: true,
    schema: { type: "string", const: baseURL },
    example: baseURL,
    description:
      "Match BETTER_AUTH_URL. Browsers supply Origin automatically; PowerShell/Postman must supply it explicitly for ownership changes.",
  };
  const identifier: ParameterObject = {
    name: "identifier",
    in: "path",
    required: true,
    schema: input(pokemonIdentifier),
    example: "pikachu",
    description:
      "Pokemon name or positive ID as a string. Trimmed and lowercased; numeric IDs must be safe integers.",
  };
  const privateSecurity = [{ trainerSession: [] }];
  const read = (
    operationId: string,
    summary: string,
    tag: string,
    response: string,
    description: string,
    errors: Record<string, ResponseObject> = databaseErrors,
  ): OperationObject => ({
    operationId,
    summary,
    tags: [tag],
    description,
    responses: { "200": json(ref(response), summary), ...errors },
  });
  const doc: OpenAPIObject = {
    openapi: "3.1.0",
    info: {
      title: "Pokemon API",
      version: "2.0.0",
      description:
        "Team battles, Pokemon caching, and trainer Pokedex ownership. Sign up/sign in to receive a session cookie. Public battle/search routes do not require authentication; /api/auth/me and /api/pokedex do. Swagger UI uses browser cookies: sign in with Try it out in this browser, then call protected routes. Its Authorize dialog cannot set an HttpOnly cookie. A PowerShell session is separate from the browser session.",
    },
    servers: [{ url: baseURL ?? "/" }],
    security: [],
    tags: ["Overview", "Battles", "Pokemon", "Resources", "Authentication", "Pokedex"].map(
      (name) => ({ name }),
    ),
    components: {
      schemas: { ...schemas },
      securitySchemes: {
        trainerSession: {
          type: "apiKey",
          in: "cookie",
          name: cookieName,
          description:
            "Signed Better Auth session cookie set by sign-up/sign-in. HTTPS adds __Secure-; this name comes from the configured auth instance. Bearer-token authentication is not enabled.",
        },
      },
    },
    paths: {
      "/api/docs": {
        get: {
          operationId: "getDocumentation",
          summary: "Open interactive Swagger UI",
          tags: ["Overview"],
          responses: {
            "200": {
              description: "Interactive API reference. Assets require internet access.",
              content: { "text/html": { schema: text } },
            },
          },
        },
      },
      "/api/docs/openapi.json": {
        get: {
          operationId: "getOpenApi",
          summary: "Download the OpenAPI document",
          tags: ["Overview"],
          responses: {
            "200": json(
              { type: "object", additionalProperties: true },
              "OpenAPI 3.1 document, generated from this configuration.",
            ),
          },
        },
      },
      "/": {
        get: read(
          "getOverview",
          "List available endpoints",
          "Overview",
          "Discovery",
          "Public API discovery.",
          {},
        ),
      },
      "/api/battles/fight": {
        post: {
          tags: ["Battles"],
          operationId: "fightTeams",
          summary: "Calculate and save a team battle",
          description:
            "Public. Teams can have different sizes. Every member is scored against all opponents. Compare team score, then total base stats, then speed; exact equality is a tie. This is not official Pokemon damage. Caches Pokemon and writes battle history. Does not check trainer ownership.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: ref("FightRequest"),
                examples: {
                  oneVsOne: { value: { team1: ["pikachu"], team2: ["geodude"] } },
                  unequal: {
                    value: { team1: ["pikachu"], team2: ["squirtle", "charmander", "bulbasaur"] },
                  },
                },
              },
            },
          },
          responses: {
            "200": json(ref("FightResponse"), "Battle saved, including ties."),
            "400": {
              description: "Invalid fight input, duplicate resolved Pokemon, or malformed JSON.",
              content: {
                "application/json": {
                  schema: { anyOf: [ref("FightValidationError"), ref("Error")] },
                },
                ...malformedJSON,
              },
            },
            ...upstreamErrors,
          },
        },
      },
      "/api/battles": {
        get: read(
          "getBattles",
          "Read saved battle history",
          "Battles",
          "BattlesResponse",
          "Public history, newest first; participants ordered by position. Migrated snapshots can be null. foughtAt is an integer Unix timestamp in seconds. No PokeAPI request.",
        ),
      },
      "/api/types/type-search": {
        get: {
          ...read(
            "searchByType",
            "Search cached Pokemon by type",
            "Pokemon",
            "TypeSearchResponse",
            "Only cached Pokemon, not the full PokeAPI roster. Unknown nonempty types return an empty list. Query is trimmed/lowercased.",
          ),
          parameters: [
            {
              name: "type",
              in: "query",
              required: true,
              schema: { type: "string", minLength: 1 },
              example: "water",
            },
          ],
          responses: {
            "200": json(ref("TypeSearchResponse"), "Alphabetically sorted cached names."),
            "400": error("Missing or blank type."),
            ...databaseErrors,
          },
        },
      },
      "/api/regions/region-search": {
        get: {
          ...read(
            "searchByRegion",
            "Search cached Pokemon by region",
            "Pokemon",
            "RegionSearchResponse",
            "Cached Pokemon with wild encounters; region means encounter location, not generation. Unknown nonempty regions return an empty list. Query is trimmed/lowercased.",
          ),
          parameters: [
            {
              name: "region",
              in: "query",
              required: true,
              schema: { type: "string", minLength: 1 },
              example: "kanto",
            },
          ],
          responses: {
            "200": json(ref("RegionSearchResponse"), "Unique alphabetically sorted cached names."),
            "400": error("Missing or blank region."),
            ...databaseErrors,
          },
        },
      },
      "/api/pokemon/{identifier}/regions": {
        get: {
          ...read(
            "getPokemonRegions",
            "Get known wild encounter regions",
            "Pokemon",
            "PokemonRegionsResponse",
            "Finds or caches the Pokemon and checks encounters. A completed check can legitimately return an empty region list.",
            upstreamErrors,
          ),
          parameters: [identifier],
          responses: {
            "200": json(ref("PokemonRegionsResponse"), "Unique sorted regions."),
            "400": error("Invalid Pokemon identifier."),
            ...upstreamErrors,
          },
        },
      },
      "/api/pokemon/{identifier}": {
        get: {
          ...read(
            "getPokemonDetail",
            "Get Pokemon stats, types, matchups, and regions",
            "Pokemon",
            "PokemonDetail",
            "Finds or caches the Pokemon. regionsComplete distinguishes unchecked from checked-with-no-encounters. Attack examples use one defending type and simplified scoring.",
            upstreamErrors,
          ),
          parameters: [identifier],
          responses: {
            "200": json(ref("PokemonDetail"), "Pokemon detail."),
            "400": error("Invalid Pokemon identifier."),
            ...upstreamErrors,
          },
        },
      },
      "/api/types": {
        get: read(
          "getTypes",
          "Get the complete type list",
          "Resources",
          "TypesResponse",
          "Fetches/caches the complete resource list if necessary, then returns sorted database data.",
          upstreamErrors,
        ),
      },
      "/api/regions": {
        get: read(
          "getRegions",
          "Get the complete region list",
          "Resources",
          "RegionsResponse",
          "Fetches/caches the complete resource list if necessary, then returns sorted database data.",
          upstreamErrors,
        ),
      },
      "/api/auth/me": {
        get: {
          ...read(
            "getCurrentTrainer",
            "Identify the signed-in trainer",
            "Authentication",
            "CurrentTrainer",
            "Safe user fields and session ID/expiry only; omits token, password, IP, and user agent. Cache-Control: no-store.",
            protectedErrors,
          ),
          security: privateSecurity,
        },
      },
      "/api/pokedex": {
        get: {
          ...read(
            "getMyPokedex",
            "List your owned Pokemon",
            "Pokedex",
            "PokedexResponse",
            "Private list ordered by Pokemon ID. Trainer identity always comes from the session. Cache-Control: no-store.",
            protectedErrors,
          ),
          security: privateSecurity,
        },
      },
      "/api/pokedex/create": {
        post: {
          tags: ["Pokedex"],
          operationId: "addMyPokemon",
          summary: "Add a Pokemon to your Pokedex",
          security: privateSecurity,
          parameters: [origin],
          description:
            "One unique entry per trainer and species. Other trainers may own the same species. Finds/caches the Pokemon before adding ownership. Cache-Control: no-store.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: ref("AddPokemonRequest"),
                example: { pokemon: "pikachu" },
              },
            },
          },
          responses: {
            "201": json(ref("PokedexEntry"), "Ownership created."),
            "400": {
              description: "Invalid body/extra fields or malformed JSON.",
              content: {
                "application/json": { schema: ref("ZodValidationError") },
                ...malformedJSON,
              },
            },
            "403": error("Missing or incorrect Origin."),
            "409": error("Pokemon is already in your Pokedex."),
            ...protectedErrors,
            ...upstreamErrors,
          },
        },
      },
      "/api/pokedex/{pokemonId}": {
        delete: {
          tags: ["Pokedex"],
          operationId: "removeMyPokemon",
          summary: "Remove your ownership entry",
          security: privateSecurity,
          parameters: [
            origin,
            {
              name: "pokemonId",
              in: "path",
              required: true,
              schema: input(removePokemonParams.shape.pokemonId),
              example: "25",
              description:
                "Positive numeric Pokemon ID from your list as a path string; maximum 2147483647. Names are rejected.",
            },
          ],
          description:
            "Deletes only your entry; preserves the shared cache, other trainers' entries, and battle history. Cache-Control: no-store.",
          responses: {
            "200": json(ref("RemovePokemonResponse"), "Ownership removed."),
            "400": json(ref("ZodValidationError"), "Invalid Pokemon ID."),
            "403": error("Missing or incorrect Origin."),
            "404": error("Pokemon is not in your Pokedex."),
            ...protectedErrors,
          },
        },
      },
    },
  };

  // Reuse installed Better Auth metadata for supported flows, then correct
  // its generic bearer-security metadata to match this cookie-only project.
  const generated = normalizeAuthMetadata(await auth.api.generateOpenAPISchema()) as OpenAPIObject;
  // Core metadata omits nullability on optional database fields. These can
  // legitimately be null in this project's auth tables and API responses.
  for (const [model, fields] of [
    ["User", ["image"]],
    ["Session", ["ipAddress", "userAgent"]],
  ] as const) {
    const modelSchema = generated.components?.schemas?.[model] as SchemaObject | undefined;
    for (const field of fields) {
      const property = modelSchema?.properties?.[field];
      if (property) modelSchema!.properties![field] = nullable(property);
    }
  }
  Object.assign(doc.components!.schemas!, generated.components?.schemas);
  for (const path of ["/sign-up/email", "/sign-in/email", "/sign-out", "/get-session"]) {
    const item = generated.paths?.[path];
    if (!item) continue;
    doc.paths![`/api/auth${path}`] = item;
    for (const method of ["get", "post"] as const) {
      const operation = item[method] as OperationObject | undefined;
      if (!operation) continue;
      operation.tags = ["Authentication"];
      operation.summary = operation.description;
      operation.security =
        path === "/sign-out" || path === "/get-session" ? [{}, ...privateSecurity] : [];
      if (method === "post")
        operation.parameters = [
          ...(operation.parameters ?? []),
          {
            ...origin,
            required: false,
            description:
              "Recommended for API clients; match BETTER_AUTH_URL. Better Auth rejects untrusted browser origins. Browsers supply this header automatically.",
          },
        ];
      const body = operation.requestBody;
      if (body && !("$ref" in body) && (path === "/sign-up/email" || path === "/sign-in/email"))
        body.required = true;
      for (const [status, response] of Object.entries(operation.responses ?? {})) {
        if (Number(status) >= 400 && !("$ref" in response))
          response.content = { "application/json": { schema: ref("AuthError") } };
      }
      if (path === "/sign-out")
        operation.description +=
          ". Clears any current session cookie; anonymous sign-out also succeeds. Request body is optional.";
      if (path === "/get-session")
        operation.description +=
          ". Returns null with no valid session; unlike /api/auth/me, anonymous access does not return 401.";
      if (path === "/sign-up/email" || path === "/sign-in/email") {
        operation.description +=
          ". Sets an HttpOnly session cookie. Email/password authentication is enabled; email verification delivery is not configured.";
        if (body && !("$ref" in body)) {
          const content = body.content["application/json"];
          content.example =
            path === "/sign-up/email"
              ? { name: "Ash", email: "ash@example.com", password: "Pikachu-Test-123!" }
              : { email: "ash@example.com", password: "Pikachu-Test-123!" };
          const shape = content.schema as SchemaObject;
          if (shape.properties?.password && !("$ref" in shape.properties.password))
            Object.assign(shape.properties.password, { minLength: 8, maxLength: 128 });
        }
      }
      const success = operation.responses?.["200"];
      if (success && !("$ref" in success) && method === "post" && path !== "/get-session")
        success.headers = {
          "Set-Cookie": {
            description:
              path === "/sign-out"
                ? "Expires the session cookie."
                : "Sets the signed HttpOnly cookie; retain it in the client's cookie jar.",
            schema: text,
          },
        };
    }
  }
  doc.paths!["/api/auth/sign-up/email"]!.post!.responses!["422"] = json(
    ref("AuthError"),
    "Email already exists (USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL), or user creation failed.",
  );
  // Concrete examples complement the schemas without exposing real user data.
  const examples: Array<[string, "get" | "post" | "delete", string, unknown]> = [
    [
      "/api/battles/fight",
      "post",
      "200",
      {
        battleId: 1,
        result: "TEAM2_WIN",
        decidedBy: "team battle score",
        team1: {
          score: 220,
          pokemon: [
            {
              position: 1,
              id: 25,
              name: "pikachu",
              result: "LOSE",
              types: ["electric"],
              totalStats: 320,
              typeMultiplier: 0,
              battleScore: 220,
            },
          ],
        },
        team2: {
          score: 350,
          pokemon: [
            {
              position: 1,
              id: 74,
              name: "geodude",
              result: "WIN",
              types: ["rock", "ground"],
              totalStats: 300,
              typeMultiplier: 2,
              battleScore: 350,
            },
          ],
        },
        note: "Each Pokemon scores its total base stats plus the rounded average type bonus against all opponents. Team scores sum member scores; this is not the official Pokemon battle system.",
      },
    ],
    [
      "/api/pokedex",
      "get",
      "200",
      {
        count: 1,
        entries: [{ pokemon: { id: 25, name: "pikachu" }, addedAt: "2026-10-03T06:00:00.000Z" }],
      },
    ],
    [
      "/api/pokedex/create",
      "post",
      "201",
      { pokemon: { id: 25, name: "pikachu" }, addedAt: "2026-10-03T06:00:00.000Z" },
    ],
    ["/api/pokedex/create", "post", "409", { error: "This Pokemon is already in your Pokedex." }],
    ["/api/pokedex/{pokemonId}", "delete", "200", { removed: true, pokemonId: 25 }],
    [
      "/api/types/type-search",
      "get",
      "200",
      { type: "water", count: 1, pokemon: ["squirtle"], scope: "cached pokemon" },
    ],
    ["/api/auth/me", "get", "401", { error: "Sign in to identify your trainer." }],
    [
      "/api/auth/sign-up/email",
      "post",
      "422",
      {
        message: "User already exists. Use another email.",
        code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
      },
    ],
  ];
  for (const [path, method, status, example] of examples) {
    const response = doc.paths![path]![method]!.responses![status] as ResponseObject;
    response.content!["application/json"].example = example;
  }
  return doc;
}
