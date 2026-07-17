// Applies migrations/*.sql in order against DATABASE_URL. Used for external
// Postgres instances (Neon, RDS, Supabase, ...) where docker-entrypoint-initdb.d
// doesn't apply (that only runs for the bundled docker-compose Postgres on
// first boot).
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import { config } from "../config";

async function main() {
  if (!config.postgres.databaseUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: config.postgres.databaseUrl,
    ssl: config.postgres.ssl ? { rejectUnauthorized: false } : undefined,
  });

  const dir = path.join(__dirname, "..", "..", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    console.log(`Applying ${file}...`);
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    await pool.query(sql);
  }

  console.log("Migrations complete.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
