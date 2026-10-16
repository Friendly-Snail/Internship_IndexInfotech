import { protectedProcedure } from "../procedures";

export const me = protectedProcedure.handler(({ context }) => {
  return context.session.user;
});
