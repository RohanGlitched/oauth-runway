import "server-only";
import type { Message, Tool } from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";
import { converse } from "./bedrock";
import { Guide, type Verification } from "./schema";
import { TOOL_SPECS, composioToolkit, fetchPage, probeOAuth, webSearch, type Source } from "./tools";

export type AgentEvent =
  | { type: "step"; text: string }
  | { type: "source"; url: string; title: string }
  | { type: "check"; text: string; passed: boolean }
  | { type: "status"; text: string };

const MAX_ROUNDS = 8;
const PAGE_CHARS = 4000;      // text of a page the first time the model sees it
const OLD_PAGE_CHARS = 700;  // once read, older pages shrink to this so context (and cost) stays flat

const SYSTEM = `You are OAuth Runway's research agent. A developer building an AI agent needs their users to connect an app.
Before launch they may have to register an OAuth app with the provider and get it approved. Your job: investigate the
provider like a careful engineer, try what can be tried, and write a practical, honest guide.

Investigate, in roughly this order (use the tools; keep it to the essentials):
1. Find the provider's official developer docs for creating an OAuth app (web_search, then fetch_page on official pages).
2. Read how registration works: account type needed (free dev account? partner program?), where to click, redirect URI
   rules, scopes, test/development mode limits, client secret handling.
3. Find the review/publishing policy: is an app review, verification, "go-live" or marketplace listing needed before
   OTHER people's accounts can authorize? What do they check, and how long does it take? Distinguish "needed for your
   users to connect" from "optional marketplace listing".
4. Run live checks with probe_oauth on the provider's domain and its authorization endpoint.
5. Check composio_toolkit for whether Composio already manages an OAuth app for this toolkit.
Then call submit_guide with the complete guide.

Budget: read at most 6 pages. Prefer the provider's OAuth/app-registration page, its scopes/redirect page and its
app review/publishing page. Skip terms of service, pricing, blog and support home pages unless they decide a blocker.
You may call several tools in one turn.

Evidence rules (most important):
- Every claim gets evidence: "verified_live" only for things a live check in THIS run confirmed; "documented" only when a
  page you fetched in this run says it (give that page as source_url); otherwise "inferred" with a short note.
- Never present a guess as fact. Put open questions in "uncertain".
- Time estimates: setup_minutes is hands-on time for a developer who has the prerequisites; approval min/max days only
  when a review is required for real users (null if none). Base them on documented timelines; if none, say so.
- difficulty: easy (self-serve, no review), moderate (self-serve with a few requirements), involved (review or
  partner program before real users), hard (long security review or multi-week approval).
- agent_vs_you: what an agent could do for the developer (find docs, fill forms, run checks, draft review answers) and
  what only the developer can do (accept terms, verify identity/domain, pay, submit for review).
- Write for a developer who will follow and share this without you: concrete, short, no marketing.`;

const SUBMIT_TOOL: Tool = {
  toolSpec: {
    name: "submit_guide",
    description: "Submit the finished guide. Call this exactly once, at the end.",
    inputSchema: { json: z.toJSONSchema(Guide) as Record<string, unknown> } as never,
  },
};

export type AgentResult = { guide: Guide; sources: { url: string; title: string }[]; usd: number; model: string; verification: Verification };

export async function runAgent(app: string, emit: (e: AgentEvent) => void): Promise<AgentResult> {
  const sources = new Map<string, Source>();
  let usd = 0;
  let model = "";
  const messages: Message[] = [{ role: "user", content: [{ text: `App to investigate: ${app}\nToday's date: ${new Date().toISOString().slice(0, 10)}` }] }];
  const tools = [...TOOL_SPECS, SUBMIT_TOOL];
  let guide: Guide | null = null;

  for (let round = 0; round < MAX_ROUNDS && !guide; round++) {
    const last = round === MAX_ROUNDS - 1;
    emit({ type: "status", text: last ? "Writing the guide" : round === 0 ? "Planning the investigation" : "Thinking" });
    const turn = await converse({ tier: "smart", system: SYSTEM, messages, tools, maxTokens: 6000, purpose: "agent",
      forceTool: last ? "submit_guide" : undefined });
    usd += turn.usd;
    model = turn.model;
    messages.push(turn.message);
    if (turn.text.trim() && !turn.toolUses.length) emit({ type: "step", text: turn.text.trim().slice(0, 300) });
    if (!turn.toolUses.length) {
      messages.push({ role: "user", content: [{ text: "Continue the investigation with the tools, then call submit_guide." }] });
      continue;
    }
    const results: Message["content"] = [];
    for (const use of turn.toolUses) {
      const input = use.input as Record<string, string>;
      let result: unknown;
      if (use.name === "submit_guide") {
        const parsed = Guide.safeParse(input);
        if (parsed.success) {
          guide = parsed.data;
          result = { ok: true };
        } else {
          result = { ok: false, error: "Guide did not match the schema. Fix these and call submit_guide again.",
            issues: parsed.error.issues.slice(0, 12).map((i) => `${i.path.join(".")}: ${i.message}`) };
          emit({ type: "status", text: "Fixing the guide format" });
        }
      } else if (use.name === "fetch_page") {
        emit({ type: "step", text: `Reading ${input.url}` });
        const p = await fetchPage(input.url);
        if (p.ok) {
          sources.set(p.url, p);
          emit({ type: "source", url: p.url, title: p.title });
        }
        result = { url: p.url, status: p.status, title: p.title, text: p.excerpt.slice(0, PAGE_CHARS) };
      } else if (use.name === "web_search") {
        emit({ type: "step", text: `Searching: ${input.query}` });
        result = await webSearch(input.query);
      } else if (use.name === "probe_oauth") {
        emit({ type: "step", text: `Live check of ${input.authorize_url ?? input.domain}` });
        const r = await probeOAuth(input);
        const probe = r.authorize_probe as { verdict?: string; http_status?: number } | undefined;
        if (probe?.verdict) emit({ type: "check", text: `${input.authorize_url ?? input.domain}: HTTP ${probe.http_status}, ${probe.verdict}`, passed: !/did not/.test(probe.verdict) });
        if (r.discovery && typeof r.discovery === "object") emit({ type: "check", text: "Published OAuth discovery document found", passed: true });
        result = r;
      } else if (use.name === "composio_toolkit") {
        emit({ type: "step", text: `Checking Composio's toolkit docs for ${input.name}` });
        const r = await composioToolkit(input.name);
        if ("url" in r && r.url) sources.set(r.url, { url: r.url, title: `Composio toolkit: ${input.name}`, excerpt: r.excerpt });
        result = r;
      } else {
        result = { error: `unknown tool ${use.name}` };
      }
      results.push({ toolResult: { toolUseId: use.id, content: [{ json: result as never }] } });
    }
    messages.push({ role: "user", content: results });
  }
  if (!guide) throw new Error("The agent did not produce a valid guide");

  emit({ type: "status", text: "Checking every documented claim against its source" });
  const v = await verify(guide, sources);
  usd += v.usd;
  return { guide: v.guide, sources: [...sources.values()].map((s) => ({ url: s.url, title: s.title })), usd, model, verification: v.verification };
}

/** Keep earlier tool results short: the model already read them, the full text stays in `sources` for the self-check. */
export function shrinkOldResults(messages: Message[]) {
  for (const m of messages) {
    if (m.role !== "user") continue;
    for (const c of m.content ?? []) {
      const tr = (c as { toolResult?: { content?: { json?: { text?: string } }[] } }).toolResult;
      const j = tr?.content?.[0]?.json;
      if (j && typeof j.text === "string" && j.text.length > OLD_PAGE_CHARS) j.text = j.text.slice(0, OLD_PAGE_CHARS) + " [...trimmed: already read]";
    }
  }
}

/** Self-check: a second model compares each "documented" claim with the text of the page it cites. */
export const normUrl = (u: string) => {
  try {
    const x = new URL(u.trim());
    return (x.host.replace(/^www\./, "") + x.pathname.replace(/\/(index\.html?)?$/, "")).toLowerCase();
  } catch {
    return u.trim().toLowerCase().replace(/\/$/, "");
  }
};

export async function verify(guide: Guide, fetched: Map<string, Source>) {
  // Index everything read in this run by normalised URL; pages cited but not yet read are fetched by the checker itself
  const sources = new Map<string, Source>();
  for (const s of fetched.values()) sources.set(normUrl(s.url), s);
  type Ev = { status: string; source_url?: string; note?: string };
  const claims: { id: number; text: string; ev: Ev }[] = [];
  const add = (text: string, ev: Ev) => claims.push({ id: claims.length, text, ev });
  guide.prerequisites.forEach((c) => add(`${c.item}: ${c.detail}`, c.evidence));
  guide.steps.forEach((s) => add(`${s.title}: ${s.detail}`, s.evidence));
  guide.requirements.forEach((c) => add(`${c.item}: ${c.detail}`, c.evidence));
  guide.gotchas.forEach((c) => add(`${c.item}: ${c.detail}`, c.evidence));
  guide.blockers.forEach((b) => add(`${b.blocker}: ${b.how_to_proceed}`, b.evidence));
  add(`Review: required=${guide.review.required}; ${guide.review.when}; ${guide.review.duration}; checks ${guide.review.what_they_check.join(", ")}`, guide.review.evidence);

  const documented = claims.filter((c) => c.ev.status === "documented");
  const verification: Verification = { checked_claims: documented.length, downgraded: [] };
  const missing = [...new Set(documented.map((c) => c.ev.source_url).filter((u): u is string => !!u && !sources.has(normUrl(u))))].slice(0, 6);
  for (const u of missing) {
    const p = await fetchPage(u);
    if (p.ok) sources.set(normUrl(u), p);
  }
  // A "documented" claim with no readable source cannot stand
  for (const c of documented) {
    if (!c.ev.source_url || !sources.has(normUrl(c.ev.source_url))) {
      verification.downgraded.push({ claim: c.text.slice(0, 160), from: "documented", reason: "cited page could not be read" });
      c.ev.status = "inferred";
      c.ev.note = "Source could not be read to confirm this";
    }
  }
  const toCheck = documented.filter((c) => c.ev.status === "documented");
  let usd = 0;
  if (toCheck.length) {
    const urls = [...new Set(toCheck.map((c) => normUrl(c.ev.source_url!)))];
    const pages = urls.map((u) => `SOURCE ${u}\n${sources.get(u)!.excerpt.slice(0, 5000)}`).join("\n\n");
    const list = toCheck.map((c) => `[${c.id}] (${normUrl(c.ev.source_url!)}) ${c.text}`).join("\n");
    const turn = await converse({
      tier: "fast", purpose: "verify", maxTokens: 1500,
      system: `You check a guide's claims against the source text they cite. A claim is SUPPORTED if the cited source states it
or clearly implies it. Return ONLY JSON: {"unsupported":[{"id":number,"reason":string}]}. Be strict but fair.`,
      messages: [{ role: "user", content: [{ text: `${pages}\n\nCLAIMS:\n${list}` }] }],
    });
    usd += turn.usd;
    try {
      const j = JSON.parse(turn.text.slice(turn.text.indexOf("{"), turn.text.lastIndexOf("}") + 1)) as { unsupported: { id: number; reason: string }[] };
      for (const u of j.unsupported ?? []) {
        const c = claims[u.id];
        if (!c || c.ev.status !== "documented") continue;
        verification.downgraded.push({ claim: c.text.slice(0, 160), from: "documented", reason: u.reason.slice(0, 200) });
        c.ev.status = "inferred";
        c.ev.note = `Self-check: ${u.reason.slice(0, 160)}`;
      }
    } catch { /* keep the agent's labels if the checker's answer is unreadable */ }
  }
  if (verification.downgraded.length) {
    guide.uncertain = [...guide.uncertain, ...verification.downgraded.map((d) => `Not confirmed by its source: ${d.claim}`)].slice(0, 20);
  }
  return { guide, verification, usd };
}
