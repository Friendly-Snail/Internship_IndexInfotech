import { ORPCError, os } from "@orpc/server";
import type { ResponseHeadersPluginContext } from "@orpc/server/plugins";
import { HTTPError, NetworkError, TimeoutError } from "ky";
import { auth } from "#/lib/auth";
import { createPokemonService } from "#/services/pokemon";

// the handlers pass the incoming request headers; ResponseHeadersPlugin adds resHeaders
export type ORPCContext = ResponseHeadersPluginContext & { headers: Headers };

// one shared Pokemon cache and PokeAPI helper set for every procedure
export const pokemonService = createPokemonService();

/**
 * Translate PokeAPI and unexpected failures into HTTP errors once for every procedure.
 * Errors that are already ORPCErrors (validation, auth, conflicts) pass through unchanged.
 */
const errorMapper = os.$context<ORPCContext>().middleware(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof ORPCError) throw error;
    if (error instanceof HTTPError) {
      if (error.response.status === 404) {
        throw new ORPCError("NOT_FOUND", { message: "Requested resource not found in PokeAPI." });
      }
      console.error(error);
      throw new ORPCError("BAD_GATEWAY", {
        message: "PokeAPI could not complete the request. Try again later.",
      });
    }
    if (error instanceof NetworkError) {
      console.error(error);
      throw new ORPCError("BAD_GATEWAY", { message: "Could not reach PokeAPI. Try again later." });
    }
    if (error instanceof TimeoutError) {
      console.error(error);
      throw new ORPCError("GATEWAY_TIMEOUT", {
        message: "PokeAPI took too long to respond. Try again later.",
      });
    }
    console.error(error);
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Request failed. Check the PostgreSQL connection and PokeAPI availability.",
    });
  }
});

export const publicProcedure = os.$context<ORPCContext>().use(errorMapper);

/**
 * Identify the trainer from the signed session cookie, never from a supplied user ID.
 *
 * @param message - The 401 message shown when no valid session exists.
 * @returns A procedure builder whose context includes the current session.
 */
export function protectedProcedure(message: string) {
  return publicProcedure.use(async ({ context, next }) => {
    context.resHeaders?.set("Cache-Control", "no-store");
    const current = await auth.api.getSession({ headers: context.headers });
    if (!current) throw new ORPCError("UNAUTHORIZED", { message });
    return next({ context: { session: current } });
  });
}

/**
 * Better Auth protects its own routes. Cookie-authenticated mutations here
 * also require the configured app origin, for RPC and OpenAPI requests alike.
 */
export const requireAppOrigin = os
  .$context<{ headers: Headers }>()
  .middleware(async ({ context, next }) => {
    if (context.headers.get("Origin") !== auth.options.baseURL) {
      throw new ORPCError("FORBIDDEN", {
        message: "Use the app's Origin header for Pokedex changes.",
      });
    }
    return next();
  });
