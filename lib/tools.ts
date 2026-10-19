import "server-only";
import type { Tool } from "@aws-sdk/client-bedrock-runtime";

const UA = "Mozilla/5.0 (compatible; OAuthRunway/1.0; +https://github.com/RohanGlitched)";
export type Source = { url: string; title: string; excerpt: string };

function clean(html: string) {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/li|\/h\d|\/tr|\/div)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

async function get(url: string, init: RequestInit = {}, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, headers: { "User-Agent": UA, ...(init.headers ?? {}) } });
  } finally {
    clearTimeout(t);
  }
}

/** Fetch a page as readable text. Falls back to a reader service for pages rendered by JavaScript. */
export async function fetchPage(url: string): Promise<Source & { ok: boolean; status: number }> {
  try {
    const r = await get(url);
    const html = await r.text();
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? url).trim().slice(0, 140);
    let text = clean(html);
    if (r.ok && text.length < 600) {
      const jr = await get(`https://r.jina.ai/${url}`, { headers: { Accept: "text/plain" } }, 25000).catch(() => null);
      if (jr?.ok) text = (await jr.text()).replace(/\n\s*\n+/g, "\n");
    }
    return { ok: r.ok, status: r.status, url: r.url || url, title, excerpt: text.slice(0, 9000) };
  } catch (e) {
    return { ok: false, status: 0, url, title: url, excerpt: `fetch failed: ${(e as Error).message}` };
  }
}

/** Probe an OAuth authorization endpoint with a dummy client: proves the endpoint exists and how it responds. */
export async function probeOAuth(input: { authorize_url?: string; domain?: string }) {
  const out: Record<string, unknown> = {};
  if (input.domain) {
    const host = input.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    for (const u of [`https://${host}/.well-known/openid-configuration`, `https://${host}/.well-known/oauth-authorization-server`]) {
      try {
        const r = await get(u, {}, 10000);
        if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) {
          const j = await r.json();
          out.discovery = { url: u, authorization_endpoint: j.authorization_endpoint, token_endpoint: j.token_endpoint,
            scopes_supported: (j.scopes_supported ?? []).slice(0, 25), pkce: j.code_challenge_methods_supported };
          break;
        }
      } catch { /* not every provider publishes discovery */ }
    }
    if (!out.discovery) out.discovery = "no OAuth/OIDC discovery document at the domain root";
  }
  const auth = input.authorize_url ?? (out.discovery as { authorization_endpoint?: string })?.authorization_endpoint;
  if (auth) {
    const u = new URL(auth);
    u.searchParams.set("client_id", "oauth-runway-probe-invalid");
    u.searchParams.set("response_type", "code");
    u.searchParams.set("redirect_uri", "https://example.com/callback");
    u.searchParams.set("state", "probe");
    try {
      const r = await get(u.toString(), { redirect: "manual" }, 12000);
      const body = (await r.text()).slice(0, 4000);
      const loc = r.headers.get("location");
      const errorHint = /invalid[_ ]client|client[_ ]id|unknown client|invalid_request|not found|redirect/i.exec(clean(body) + " " + (loc ?? ""))?.[0];
      out.authorize_probe = {
        url: auth, http_status: r.status, redirects_to: loc ? new URL(loc, auth).host + new URL(loc, auth).pathname : null,
        error_hint: errorHint ?? null,
        verdict: r.status >= 500 || r.status === 0 ? "endpoint did not respond normally"
          : "endpoint is live: it accepted the request and rejected or redirected the unregistered client",
      };
    } catch (e) {
      out.authorize_probe = { url: auth, error: (e as Error).message };
    }
  }
  return out;
}

/** Composio's docs for a toolkit: whether OAuth is managed by Composio or bring-your-own. */
export async function composioToolkit(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const candidates = [slug, slug.replace(/_/g, ""), slug.replace(/_/g, "-")];
  for (const s of candidates) {
    const p = await fetchPage(`https://docs.composio.dev/toolkits/${s}`);
    if (p.ok && !/page not found|404/i.test(p.title)) {
      return { url: p.url, slug: s, excerpt: p.excerpt.slice(0, 3500) };
    }
  }
  return { note: "No Composio toolkit page found under the obvious slugs; the app may not be a Composio toolkit yet." };
}

export async function webSearch(query: string) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return { note: "Web search is not configured. Find the provider's developer docs by URL (developers.<domain>, <domain>/developers, docs.<domain>) and fetch them." };
  const r = await get("https://api.tavily.com/search", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, max_results: 6, search_depth: "basic" }),
  }, 20000);
  if (!r.ok) return { error: `search failed (${r.status})` };
  const j = await r.json();
  return { results: (j.results ?? []).map((x: { url: string; title: string; content: string }) => ({ url: x.url, title: x.title, snippet: x.content?.slice(0, 300) })) };
}

export const TOOL_SPECS: Tool[] = [
  { toolSpec: { name: "web_search", description: "Search the web. Use it to find the provider's official developer docs for OAuth app registration, scopes and app review/publishing policy.",
    inputSchema: { json: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } } },
  { toolSpec: { name: "fetch_page", description: "Fetch a web page and return its readable text (first ~9000 characters). Use official provider docs as sources.",
    inputSchema: { json: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } } },
  { toolSpec: { name: "probe_oauth", description: "Live check: look for an OAuth/OIDC discovery document on a domain and/or call an authorization endpoint with an invalid client to confirm it is live and see how it responds.",
    inputSchema: { json: { type: "object", properties: { authorize_url: { type: "string" }, domain: { type: "string" } } } } } },
  { toolSpec: { name: "composio_toolkit", description: "Read Composio's toolkit docs page for this app (managed OAuth vs bring-your-own OAuth app, auth schemes).",
    inputSchema: { json: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } } } },
];
