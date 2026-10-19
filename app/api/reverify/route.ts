import { verify } from "@/lib/agent";
import { ensureSchema, sql } from "@/lib/db";
import type { Guide } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Admin only: re-run the self-check on a stored guide (the checker fetches the cited pages itself). */
export async function POST(req: Request) {
  if (!process.env.ADMIN_TOKEN || req.headers.get("x-admin-token") !== process.env.ADMIN_TOKEN) {
    return Response.json({ error: "Not allowed" }, { status: 403 });
  }
  await ensureSchema();
  const { slug } = (await req.json()) as { slug: string };
  const [row] = await sql`select guide from guides where slug = ${slug}`;
  if (!row?.guide) return Response.json({ error: "No guide" }, { status: 404 });
  const g = row.guide as Guide & { verification?: unknown; sources?: unknown };
  // Undo downgrades made only because a cited page "was not read" (a URL-matching bug, fixed)
  let restored = 0;
  const fix = (ev: Guide["review"]["evidence"]) => {
    if (ev.status === "inferred" && ev.note === "Source not confirmed in this run" && ev.source_url) {
      ev.status = "documented";
      ev.note = undefined;
      restored++;
    }
  };
  [...g.prerequisites, ...g.steps, ...g.requirements, ...g.gotchas, ...g.blockers].forEach((c) => fix(c.evidence));
  fix(g.review.evidence);
  g.uncertain = g.uncertain.filter((u) => !u.startsWith("Not confirmed by its source:"));
  const v = await verify(g, new Map());
  const updated = { ...v.guide, sources: g.sources, verification: v.verification, checked_at: new Date().toISOString() };
  await sql`update guides set guide = ${JSON.stringify(updated)}::jsonb, cost_usd = cost_usd + ${v.usd}, updated_at = now() where slug = ${slug}`;
  return Response.json({ restored, verification: v.verification, usd: v.usd });
}
