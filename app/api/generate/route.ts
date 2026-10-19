import { createHash } from "crypto";
import { runAgent, type AgentEvent } from "@/lib/agent";
import { BudgetExceeded } from "@/lib/bedrock";
import { ensureSchema, sql } from "@/lib/db";
import { slugify } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 300;

const PER_VISITOR_PER_HOUR = 3;
const GLOBAL_PER_DAY = 25;
const CACHE_DAYS = 7;

export async function POST(req: Request) {
  await ensureSchema();
  const body = (await req.json().catch(() => ({}))) as { app?: string; refresh?: boolean };
  const app = (body.app ?? "").trim().slice(0, 120);
  const slug = slugify(app);
  if (!app || !slug) return Response.json({ error: "Enter an app name or website" }, { status: 400 });

  const admin = !!process.env.ADMIN_TOKEN && req.headers.get("x-admin-token") === process.env.ADMIN_TOKEN;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const visitor = createHash("sha256").update(`${ip}|${new Date().toISOString().slice(0, 10)}|${process.env.ADMIN_TOKEN ?? ""}`).digest("hex").slice(0, 16);

  const [existing] = await sql`select status, updated_at from guides where slug = ${slug}`;
  const fresh = existing && existing.status === "ready" && Date.now() - new Date(existing.updated_at).getTime() < CACHE_DAYS * 864e5;
  if (fresh && !(admin && body.refresh)) {
    return stream(async (send) => { send({ type: "cached", slug }); });
  }
  if (existing?.status === "generating" && Date.now() - new Date(existing.updated_at).getTime() < 5 * 60_000) {
    return Response.json({ error: "A guide for this app is being generated right now. Try again in a minute." }, { status: 409 });
  }
  if (!admin) {
    const [{ mine }] = await sql`select count(*)::int as mine from generations where visitor = ${visitor} and ts > now() - interval '1 hour'`;
    const [{ all }] = await sql`select count(*)::int as all from generations where ts > now() - interval '1 day'`;
    if (mine >= PER_VISITOR_PER_HOUR) return Response.json({ error: "You've generated 3 guides this hour. Try again later or browse the library." }, { status: 429 });
    if (all >= GLOBAL_PER_DAY) return Response.json({ error: "Today's live-generation limit is reached. Browse the library or try tomorrow." }, { status: 429 });
  }
  await sql`insert into generations (visitor, slug) values (${visitor}, ${slug})`;
  await sql`insert into guides (slug, app_name, status, updated_at) values (${slug}, ${app}, 'generating', now())
            on conflict (slug) do update set status = 'generating', updated_at = now()`;

  return stream(async (send) => {
    const t0 = Date.now();
    const log: AgentEvent[] = [];
    try {
      const r = await runAgent(app, (e) => { log.push(e); send(e); });
      const guide = { ...r.guide, sources: r.sources, checked_at: new Date().toISOString(), verification: r.verification };
      await sql`update guides set status = 'ready', app_name = ${r.guide.app.name}, website = ${r.guide.app.website},
                guide = ${JSON.stringify(guide)}::jsonb, run_log = ${JSON.stringify(log)}::jsonb, model = ${r.model},
                cost_usd = ${r.usd}, seconds = ${(Date.now() - t0) / 1000}, updated_at = now() where slug = ${slug}`;
      send({ type: "done", slug, cost: Number(r.usd.toFixed(4)), seconds: Math.round((Date.now() - t0) / 1000) });
    } catch (e) {
      const msg = e instanceof BudgetExceeded ? e.message : `Generation failed: ${(e as Error).message.slice(0, 200)}`;
      await sql`update guides set status = 'failed', run_log = ${JSON.stringify(log)}::jsonb, updated_at = now() where slug = ${slug}`;
      send({ type: "error", text: msg });
    }
  });
}

function stream(run: (send: (e: object) => void) => Promise<void>) {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (e: object) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try { await run(send); } finally { controller.close(); }
    },
  });
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
