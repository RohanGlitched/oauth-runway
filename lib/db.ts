import "server-only";
import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL!);

let ready: Promise<void> | null = null;

/** Creates tables on first use (idempotent). */
export function ensureSchema() {
  ready ??= (async () => {
    await sql`create table if not exists guides (
      slug text primary key,
      app_name text not null,
      website text,
      status text not null default 'ready',
      in_library boolean not null default false,
      guide jsonb,
      run_log jsonb not null default '[]',
      model text,
      cost_usd real not null default 0,
      seconds real,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now())`;
    await sql`create table if not exists llm_calls (
      ts timestamptz not null default now(), model text, purpose text, input int, output int, usd real)`;
    await sql`create table if not exists generations (
      ts timestamptz not null default now(), visitor text, slug text)`;
  })();
  return ready;
}
