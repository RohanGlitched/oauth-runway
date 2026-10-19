import "server-only";
import { ensureSchema, sql } from "./db";
import type { StoredGuide } from "./schema";

const row = (g: Record<string, unknown>): StoredGuide => ({
  slug: g.slug as string,
  appName: g.app_name as string,
  website: (g.website as string) ?? null,
  status: g.status as StoredGuide["status"],
  inLibrary: !!g.in_library,
  guide: (g.guide as StoredGuide["guide"]) ?? null,
  costUsd: Number(g.cost_usd ?? 0),
  seconds: g.seconds == null ? null : Number(g.seconds),
  model: (g.model as string) ?? null,
  updatedAt: new Date(g.updated_at as string).toISOString(),
});

export async function getGuides(): Promise<StoredGuide[]> {
  await ensureSchema();
  const rows = await sql`select slug, app_name, website, status, in_library, guide, cost_usd, seconds, model, updated_at
                         from guides where status = 'ready' order by in_library desc, updated_at desc limit 200`;
  return rows.map(row);
}

export async function getGuide(slug: string): Promise<StoredGuide | null> {
  await ensureSchema();
  const [g] = await sql`select slug, app_name, website, status, in_library, guide, cost_usd, seconds, model, updated_at
                        from guides where slug = ${slug}`;
  return g ? row(g) : null;
}
