import "dotenv/config";

import path from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to run migrations");

const pool = new Pool({ connectionString });
try {
  const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");
  await migrate(drizzle(pool), { migrationsFolder });
  console.log("Database migrations applied");
} finally {
  await pool.end();
}
