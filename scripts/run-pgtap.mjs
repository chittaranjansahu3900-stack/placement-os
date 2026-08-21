// Docker-free pgTAP runner: executes every supabase/tests/database/*.test.sql file
// statement-by-statement against DB_URL, printing TAP output. Exists because `supabase test db`
// requires Docker, which hasn't been available in this environment. Not a permanent tool -- once
// Docker or a real CI runner is available, prefer `supabase test db` and delete this.
//
// Usage:
//   DB_URL=postgres://... node scripts/run-pgtap.mjs                       # run every test file
//   DB_URL=postgres://... node scripts/run-pgtap.mjs path/to/one.test.sql  # run just one

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const TEST_DIR = "supabase/tests/database";

function resolveFiles() {
  const arg = process.argv[2];
  if (arg) return [arg];
  return fs
    .readdirSync(TEST_DIR)
    .filter((f) => f.endsWith(".test.sql"))
    .sort()
    .map((f) => path.join(TEST_DIR, f));
}

function splitStatements(sql) {
  // Strip full-line comments, then split on statement-terminating semicolons. Safe for this
  // repo's pgTAP files: no semicolons appear inside string literals or dollar-quoted bodies.
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function runFile(client, file) {
  console.log(`\n=== ${file} ===`);
  const statements = splitStatements(fs.readFileSync(file, "utf8"));
  let failed = 0;
  let ran = 0;
  try {
    for (const stmt of statements) {
      ran++;
      const result = await client.query(stmt);
      if (result.rows?.length && result.fields?.[0]) {
        for (const row of result.rows) {
          const line = Object.values(row)[0];
          if (
            typeof line === "string" &&
            (line.startsWith("ok ") || line.startsWith("not ok ") || line.startsWith("#") || /^\d+\.\.\d+$/.test(line))
          ) {
            console.log(line);
            if (line.startsWith("not ok ")) failed++;
          }
        }
      }
    }
  } catch (e) {
    console.error(`FAILED at statement ${ran}:`, e.message);
    console.error("Statement was:", statements[ran - 1]);
    return false;
  }
  console.log(failed === 0 ? "PASSED" : `${failed} TEST(S) FAILED`);
  return failed === 0;
}

if (!process.env.DB_URL) {
  console.error("Set DB_URL to a Postgres connection string first.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

let allPassed = true;
for (const file of resolveFiles()) {
  const ok = await runFile(client, file);
  allPassed = allPassed && ok;
}

await client.end();
process.exit(allPassed ? 0 : 1);
