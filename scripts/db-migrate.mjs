#!/usr/bin/env node
/**
 * Applies supabase/migrations/*.sql in filename order, once each.
 *
 * Bookkeeping uses the Supabase CLI's own table
 * (supabase_migrations.schema_migrations), so `supabase db push` can take
 * over later without re-applying anything. Each migration file also
 * self-registers there, so one pasted into the Supabase SQL editor by hand
 * is recorded the same way — this runner then skips it.
 *
 * Usage:  SUPABASE_DB_URL=postgresql://… pnpm db:migrate
 *         (the "Session" pooler URI from Project Settings → Database;
 *          also read from .env.local when the variable is not set)
 *
 * Needs a direct Postgres connection (port 5432). Environments that only
 * allow HTTPS egress cannot run this — use the SQL editor there.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

async function readDbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  try {
    const env = await readFile(path.resolve(".env.local"), "utf8");
    const line = env
      .split(/\r?\n/)
      .find((l) => l.startsWith("SUPABASE_DB_URL="));
    if (line) return line.slice("SUPABASE_DB_URL=".length).trim().replace(/^["']|["']$/g, "");
  } catch {
    // no .env.local — fall through
  }
  return null;
}

const url = await readDbUrl();
if (!url) {
  console.error("SUPABASE_DB_URL is not set (environment or .env.local) — see .env.example");
  process.exit(1);
}

const dir = path.resolve("supabase/migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({
  connectionString: url,
  // Supabase terminates TLS with a certificate chain Node does not ship;
  // the connection is still encrypted, only the chain is not verified.
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
});
try {
  await client.connect();
} catch (err) {
  console.error(
    `Could not connect to the database: ${err.message}\n` +
      "If this environment only allows HTTPS egress, apply the migration via the Supabase SQL editor instead.",
  );
  process.exit(1);
}

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
       values ($1, $2, $3)
       on conflict (version) do update set statements = excluded.statements`,
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
