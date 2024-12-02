import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./app/db/db.schema.ts",
  driver: "pglite",
});
