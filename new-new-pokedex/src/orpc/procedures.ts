import { ORPCError, os } from "@orpc/server";
import type { RequestHeadersPluginContext } from "@orpc/server/plugins";
import { db } from "#/db";
import { auth } from "#/lib/auth";

export interface ServerContext extends RequestHeadersPluginContext {
  db?: typeof db;
  session: Awaited<ReturnType<typeof auth.api.getSession>>;
}

export const baseProcedure = os.$context<ServerContext>().use(async ({ context, next }) => {
  return next({ context: { ...context, db } });
});

export const publicProcedure = baseProcedure;

export const protectedProcedure = baseProcedure.use(async ({ context, next }) => {
  if (!context.reqHeaders?.get("Authorization")) {
    throw new ORPCError("UNAUTHORIZED");
  }

  const session = await auth.api.getSession({ headers: context.reqHeaders });

  if (!session) throw new ORPCError("UNAUTHORIZED");

  return next({ context: { ...context, session } });
});
