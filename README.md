# OAuth Runway

**How long until your agent's users can connect this app?**

A developer building an AI agent wants their users to connect an app. Before launch they often have to register their own
OAuth app with the provider, and sometimes get it reviewed. OAuth Runway turns that unknown into a guide: the hands-on setup
time, the approval wait, the requirements that trip people up, what to do when blocked, and, for every claim, the evidence
behind it.

- **Library:** ready guides for apps with different setup paths (self-serve, partner programs, go-live reviews, marketplace review).
- **Live generation:** submit any app name or website; an agent investigates it and writes a shareable guide in about two minutes.
- **Evidence on every claim:** *verified live* (a check in this run confirmed it), *documented* (a page read in this run says it, with the link), or *inferred* (labelled, never presented as fact).

## How it works

```
 app name / URL
      |
      v
 research agent (Claude on Amazon Bedrock, tool use, max 8 rounds)
   - web_search ........ finds the provider's official developer docs (Tavily)
   - fetch_page ........ reads registration, scopes, redirect-URI and review/publishing pages
   - probe_oauth ....... live check: OAuth/OIDC discovery + calls the authorize endpoint with an
                         unregistered client to confirm it is live and see how it rejects it
   - composio_toolkit .. reads Composio's toolkit docs: managed OAuth or bring-your-own
   - submit_guide ...... structured guide (zod schema), every claim with an evidence label
      |
      v
 self-check (second model call): every "documented" claim is compared with the text of the
 page it cites; unsupported claims are downgraded to "inferred" and listed under "Not verified"
      |
      v
 Neon Postgres (guides, run logs, cost ledger)  ->  Next.js pages (library, guide, live run)
```

The live page streams the agent's steps (pages read, live checks, sources) as they happen.

## Key decisions

- **Answer the developer's real question first.** Every guide opens with a verdict: difficulty, hands-on setup time and
  approval wait, kept separate because "30 minutes of work" and "3 weeks of waiting" plan very differently.
- **Evidence over confidence.** A guide that says "inferred" where the docs are silent is more useful than one that sounds
  sure. The self-check enforces this: on the first Bitly run it downgraded 5 of 15 "documented" claims that their cited
  page did not actually support.
- **Agents do the investigation, not the guessing.** The agent must read the pages it cites in the same run; a claim citing
  a page it never fetched is downgraded automatically.
- **Composio context in every guide.** Composio's managed-auth directory lists 123 toolkits with managed OAuth and 211
  "bring your own OAuth app". Each guide states which side the app is on, because that decides whether the developer
  needs this guide at all.
- **App selection.** The library covers different setup paths rather than famous names: instant self-serve (Bitly,
  DigitalOcean), workspace apps with optional marketplace listing (Webflow), private vs public apps (Pipedrive), partner
  accounts and distribution choices (Shopify), a sandbox-then-go-live review (DocuSign) and marketplace publishing review
  (Zoom Team Chat). Gated and paid-API apps were left out on purpose for this slice.
- **One "what an agent can do vs what only you can do" section** per guide instead of labelling each step: the brief asks
  for it, and a single section reads better than tags on every line.
- **Safe to leave public.** Live generation is rate limited (3 per visitor per hour, 25 per day overall), finished guides
  are cached for 7 days, and the model has a hard spending cap checked before every call.

## Limitations

- Guides reflect public documentation and live endpoint checks. The agent does not sign in to provider consoles, create
  real OAuth apps or submit reviews, so console click-paths and review timelines are only as current as the docs.
- Review durations are rarely published; when no source states one, the guide says so instead of estimating silently.
- Some documentation sites are rendered by JavaScript; the fetcher falls back to a reader service, which can miss content.
- The library is a slice (7 apps), not the 100-app target. The same agent run produces each guide; scaling is a batch job
  plus a periodic re-check.

## Run it locally

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (tables are created on first use) |
| `BEDROCK_ACCESS_KEY_ID`, `BEDROCK_SECRET_ACCESS_KEY`, `BEDROCK_REGION` | AWS credentials limited to Claude on Bedrock |
| `TAVILY_API_KEY` | Web search for the agent (optional; without it the agent finds docs by URL) |
| `ADMIN_TOKEN` | Lets you refresh library guides (`x-admin-token` header) |
| `AGENT_MONTHLY_CAP_USD`, `AGENT_DAILY_CAP_USD` | Hard spending caps for model calls |

Generate or refresh a guide from the command line:

```bash
curl -N -X POST localhost:3000/api/generate -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" -d '{"app":"Pipedrive","refresh":true}'
```
