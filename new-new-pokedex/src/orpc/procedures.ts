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
  // browsers authenticate with the better-auth session cookie, not an Authorization header
  const session =
    context.session ??
    (context.reqHeaders ? await auth.api.getSession({ headers: context.reqHeaders }) : null);

  if (!session) throw new ORPCError("UNAUTHORIZED");

  return next({ context: { ...context, session } });
});
