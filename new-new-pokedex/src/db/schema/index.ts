// export generated auth tables and their unchanged child relations explicitly
// the application userRelations below includes sessions, accounts, and Pokedex entries
export { user, session, account, verification } from "./auth-schema";
export * from "./pokemon";
