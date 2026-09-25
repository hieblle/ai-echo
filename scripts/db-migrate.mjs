#!/usr/bin/env node
/**
 * Applies supabase/migrations/*.sql in filename order, once each.
 *
 * Bookkeeping uses the Supabase CLI's own table
 * (supabase_migrations.schema_migrations), so `supabase db push` can take
 * over later without re-applying anything.
 *
 * Usage:  SUPABASE_DB_URL=postgresql://… pnpm db:migrate
 *         (the "Session" pooler URI from Project Settings → Database)
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set — see .env.example");
  process.exit(1);
}

const dir = path.resolve("supabase/migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({
  connectionString: url,
  // Supabase terminates TLS with a certificate chain Node does not ship;
  // the connection is still encrypted, only the chain is not verified.
  ssl: { rejectUnauthorized: false },
});
await client.connect();

await client.query("create schema if not exists supabase_migrations");
await client.query(
  `create table if not exists supabase_migrations.schema_migrations (
     version text primary key,
     statements text[],
     name text
   )`,
);
const applied = new Set(
  (
    await client.query(
      "select version from supabase_migrations.schema_migrations",
    )
  ).rows.map((r) => r.version),
);

let count = 0;
for (const file of files) {
  const [version] = file.split("_");
  const name = file.slice(version.length + 1, -".sql".length);
  if (applied.has(version)) {
    console.log(`skip    ${file}`);
    continue;
  }
  const sql = await readFile(path.join(dir, file), "utf8");
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query(
      `insert into supabase_migrations.schema_migrations (version, statements, name)
       values ($1, $2, $3)`,
      [version, [sql], name],
    );
    await client.query("commit");
    console.log(`applied ${file}`);
    count += 1;
  } catch (err) {
    await client.query("rollback");
    console.error(`FAILED  ${file}\n${err.message}`);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log(count === 0 ? "Database is up to date." : `${count} migration(s) applied.`);
