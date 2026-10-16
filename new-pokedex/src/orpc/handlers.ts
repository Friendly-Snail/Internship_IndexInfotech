import "#/polyfill";

import { SmartCoercionPlugin } from "@orpc/json-schema";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ORPCError, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ResponseHeadersPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { auth } from "#/lib/auth";
import router from "#/orpc/router";

// the base middleware logs the failures it translates; this catches anything it never saw,
// such as an output that fails its schema (an ORPCError carrying the validation cause)
function logUnexpected(error: unknown) {
  if (!(error instanceof ORPCError) || (error.status >= 500 && error.cause)) console.error(error);
}

// typed RPC endpoint used by the frontend's oRPC client
export const rpcHandler = new RPCHandler(router, {
  interceptors: [onError(logUnexpected)],
  plugins: [new ResponseHeadersPlugin()],
});

// Better Auth endpoints documented alongside the oRPC procedures
const authPaths = ["/sign-up/email", "/sign-in/email", "/sign-out", "/get-session"];

/**
 * Build the OpenAPI document options, adding Better Auth's own metadata for the
 * supported email/password flows and the cookie used by protected procedures.
 */
async function specGenerateOptions() {
  const cookieName = (await auth.$context).authCookies.sessionToken.name;
  const generated = await auth.api.generateOpenAPISchema();
  const paths: Record<string, unknown> = {};
  for (const path of authPaths) {
    const item = generated.paths[path] as Record<string, Record<string, unknown>> | undefined;
    if (!item) continue;
    for (const operation of Object.values(item)) {
      operation.tags = ["Authentication"];
      // this project authenticates with the session cookie, not bearer tokens
      operation.security = [{ trainerSession: [] }];
    }
    paths[`/auth${path}`] = item;
  }
  return {
    info: {
      title: "Pokemon API",
      version: "3.0.0",
      description:
        "Team battles, Pokemon caching, and trainer Pokedex ownership. Sign up/sign in to receive a session cookie. Public battle/search routes do not require authentication; /api/auth/me and /api/pokedex do. Pokedex changes also require an Origin header matching BETTER_AUTH_URL.",
    },
    servers: [{ url: "/api" }],
    tags: ["Overview", "Battles", "Pokemon", "Resources", "Authentication", "Pokedex"].map(
      (name) => ({ name }),
    ),
    paths: paths as never,
    components: {
      schemas: generated.components.schemas as never,
      securitySchemes: {
        trainerSession: {
          type: "apiKey" as const,
          in: "cookie" as const,
          name: cookieName,
          description: "Signed Better Auth session cookie set by sign-up/sign-in.",
        },
      },
    },
  };
}

// REST endpoints keep the original /api/... paths, plus Swagger UI and the OpenAPI document
export const openAPIHandler = new OpenAPIHandler(router, {
  interceptors: [onError(logUnexpected)],
  plugins: [
    new ResponseHeadersPlugin(),
    new SmartCoercionPlugin({ schemaConverters: [new ZodToJsonSchemaConverter()] }),
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
      docsProvider: "swagger",
      docsPath: "/docs",
      specPath: "/docs/openapi.json",
      docsTitle: "Pokemon API documentation",
      specGenerateOptions,
    }),
  ],
});

/**
 * Serve a request with one of the oRPC handlers.
 *
 * @param handler - The RPC or OpenAPI handler.
 * @param prefix - The URL prefix the handler is mounted under.
 * @returns A request handler for TanStack Start server routes.
 */
export function serve(handler: RPCHandler<any> | OpenAPIHandler<any>, prefix: `/${string}`) {
  return async ({ request }: { request: Request }) => {
    const { response } = await handler.handle(request, {
      prefix,
      context: { headers: request.headers },
    });
    return response ?? Response.json({ error: "Not Found" }, { status: 404 });
  };
}
