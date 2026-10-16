import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db } from '#/db'
import { account, session, user, verification } from '#/db/schema/auth-schema'

export const auth = betterAuth({
  // store users and sessions in postgres; without this better-auth keeps them in memory
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [tanstackStartCookies()],
})
