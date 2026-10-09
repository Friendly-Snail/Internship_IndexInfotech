// expose both schemas through one import for database setup and migrations
export * from "./auth-schema";
export * from "./pokemon";

// prefer the application extension that retains auth relations and adds ownership
export { userRelations } from "./pokemon";
