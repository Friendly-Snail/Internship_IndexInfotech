import { TrainerSchema } from "#/orpc/schema";
import { protectedProcedure } from "../base";

// Better Auth's own routes (sign-up, sign-in, sign-out, get-session) stay on /api/auth/*
// this procedure is the project's safe trainer summary; anonymous callers receive 401
export const me = protectedProcedure("Sign in to identify your trainer.")
  .route({
    method: "GET",
    path: "/auth/me",
    tags: ["Authentication"],
    summary: "Identify the signed-in trainer",
  })
  .output(TrainerSchema)
  .handler(({ context: { session: current } }) => ({
    user: {
      id: current.user.id,
      name: current.user.name,
      email: current.user.email,
      emailVerified: current.user.emailVerified,
    },
    session: { id: current.session.id, expiresAt: current.session.expiresAt },
  }));
