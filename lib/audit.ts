/**
 * Manual audit: claims from the generated guides checked by hand against the provider's own docs (Oct 19, 2026).
 * "confirmed" = the source says it; "corrected" = the guide was wrong or mislabelled and was fixed;
 * "not found" = the cited source does not say it, so the claim stays labelled as unverified.
 */
export type AuditItem = { claim: string; result: "confirmed" | "corrected" | "not found"; note: string; source: string };
export type Audit = { slug: string; checked: string; items: AuditItem[]; learned: string };

export const AUDITS: Audit[] = [
  {
    slug: "bitly",
    checked: "2026-10-19",
    learned: "Bitly's docs describe registration in one sentence and say nothing about review. The guide's 'no review' verdict is correctly labelled inferred: absence of a review in the docs is evidence, not proof.",
    items: [
      { claim: "Register from Developer settings with 'Register new app'", result: "confirmed", note: "Docs: log in, go to Developer settings and click Register new app.", source: "https://dev.bitly.com/docs/getting-started/authentication/" },
      { claim: "An email with a registration link must be completed before you get credentials", result: "confirmed", note: "Docs: 'You'll receive an email with a registration link. Complete the registration and your app will be assigned a client_id and a client_secret.'", source: "https://dev.bitly.com/docs/getting-started/authentication/" },
      { claim: "No app review before other Bitly users can authorize", result: "not found", note: "The authentication page never mentions review or approval. Kept as inferred.", source: "https://dev.bitly.com/docs/getting-started/authentication/" },
      { claim: "The live check: authorize endpoint rejects an unregistered client", result: "confirmed", note: "Re-ran the probe: HTTP 400 with INVALID_CLIENT for a made-up client_id.", source: "https://bitly.com/oauth/authorize" },
    ],
  },
  {
    slug: "digitalocean",
    checked: "2026-10-19",
    learned: "The agent was too cautious on token lifetime and missed that DigitalOcean supports dynamic client registration and PKCE public clients, which changes the setup for agent builders. Both were added.",
    items: [
      { claim: "redirect_uri must match a callback URL registered for the app", result: "confirmed", note: "OAuth reference: 'Must match a callback URL you provided during application registration.'", source: "https://docs.digitalocean.com/reference/api/oauth/" },
      { claim: "Access tokens last 30 days", result: "corrected", note: "Labelled inferred (community answer) but the OAuth reference documents expires_in=2592000 (30 days). Relabelled documented.", source: "https://docs.digitalocean.com/reference/api/oauth/" },
      { claim: "OAuth scopes are just 'read' and 'write'", result: "not found", note: "The OAuth reference links to the granular token scopes list; it does not describe two primary scopes. The self-check had already downgraded this.", source: "https://docs.digitalocean.com/reference/api/scopes/" },
      { claim: "(missing) Dynamic client registration and PKCE public clients", result: "corrected", note: "The OAuth reference documents a /register endpoint for dynamic client registration and PKCE for public clients. Added as a gotcha.", source: "https://docs.digitalocean.com/reference/api/oauth/" },
    ],
  },
  {
    slug: "webflow",
    checked: "2026-10-19",
    learned: "Webflow is the clearest case of 'setup is quick, reaching real users is not': the app works in your own workspace immediately, but other workspaces need Marketplace approval.",
    items: [
      { claim: "Create the app from Settings > Apps & Integrations > App Development > Create an App", result: "confirmed", note: "Matches the registration page step by step.", source: "https://developers.webflow.com/data/docs/register-an-app" },
      { claim: "Description is limited to 140 characters", result: "confirmed", note: "Registration page: 'A brief summary of your App's purpose (140 characters max)'.", source: "https://developers.webflow.com/data/docs/register-an-app" },
      { claim: "External users can't install until the app is approved in the Webflow Marketplace; user testing is possible before review", result: "confirmed", note: "Both stated on the registration page.", source: "https://developers.webflow.com/data/docs/register-an-app" },
      { claim: "A free Developer Workspace is available for building apps", result: "not found", note: "Labelled documented, but the cited registration page doesn't mention it (the self-check missed this). Relabelled inferred.", source: "https://developers.webflow.com/data/docs/register-an-app" },
    ],
  },
];

export const auditFor = (slug: string) => AUDITS.find((a) => a.slug === slug);
