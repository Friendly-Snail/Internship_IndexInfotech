import { createRouterClient } from "@orpc/server";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { createIsomorphicFn } from "@tanstack/react-start";

import type { RouterClient } from "@orpc/server";

import router from "#/orpc/router";
import { db } from "#/db";
import { auth } from "#/lib/auth";

const getORPCClient = createIsomorphicFn()
  .server(() =>
    createRouterClient(router, {
      context: async () => {
        const session = await auth.api.getSession({ headers: getRequestHeaders() });

        return {
          reqHeaders: getRequestHeaders(),
          db,
          session,
        };
      },
    }),
  )
  .client((): RouterClient<typeof router> => {
    const link = new RPCLink({
      url: `/api/rpc`,
    });
    return createORPCClient(link);
  });

export const client: RouterClient<typeof router> = getORPCClient();

export const orpc = createTanstackQueryUtils(client);
