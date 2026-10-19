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
  {
    slug: "pipedrive",
    checked: "2026-10-19",
    learned: "Pipedrive separates reaching users from being discoverable: a private app can go live for any company through a direct link, and Marketplace review only matters for listing.",
    items: [
      { claim: "Only one OAuth callback URL per app", result: "confirmed", note: "Registration docs: 'we allow only one callback URL per app'.", source: "https://pipedrive.readme.io/docs/marketplace-registering-a-private-app" },
      { claim: "The authorization code expires in 5 minutes", result: "confirmed", note: "OAuth docs: 'the authorization_code expires in 5 minutes'.", source: "https://pipedrive.readme.io/docs/marketplace-oauth-authorization" },
      { claim: "Public app review can take up to 21 business days", result: "confirmed", note: "A temporary banner on the approval page; the guide labels it as a current notice, not a fixed SLA.", source: "https://pipedrive.readme.io/docs/marketplace-app-approval-process" },
      { claim: "Install and test a draft app before making a private app live", result: "confirmed", note: "Registration docs describe testing the draft before going live.", source: "https://pipedrive.readme.io/docs/marketplace-registering-a-private-app" },
    ],
  },
  {
    slug: "shopify",
    checked: "2026-10-19",
    learned: "The first draft put a community-reported review time (5 to 10 business days) in the verdict as if it were fact. Shopify publishes no review timeline, so the verdict now says so and the range is kept only as a labelled note.",
    items: [
      { claim: "The distribution method can't be changed after you pick it", result: "confirmed", note: "Distribution docs: 'You can't change the distribution method after you select it.'", source: "https://shopify.dev/docs/apps/launch/distribution" },
      { claim: "Custom-distribution apps can't charge through Shopify billing", result: "confirmed", note: "Distribution comparison table.", source: "https://shopify.dev/docs/apps/launch/distribution" },
      { claim: "App Store review takes 5 to 10 business days", result: "corrected", note: "The review-process page gives no timeline. Verdict changed to 'Required, timeline not published'.", source: "https://shopify.dev/docs/apps/launch/app-store-review/review-process" },
    ],
  },
  {
    slug: "zoom-team-chat",
    checked: "2026-10-19",
    learned: "Two corrections: the review time came from a page that did not show it, and the token advice contradicted Zoom's own OAuth docs. Both were fixed; internal-only apps skipping review was confirmed.",
    items: [
      { claim: "Apps limited to 'Users within my Zoom account' don't need review", result: "confirmed", note: "Submission docs: internal-use apps are discoverable only inside your account and are intended for internal use.", source: "https://developers.zoom.us/docs/distribute/app-submission/submit-apps-review" },
      { claim: "Marketplace review takes 2 to 7 days", result: "corrected", note: "The cited blog post showed no timeline when fetched. Verdict changed to 'timeline not confirmed'.", source: "https://developers.zoom.us/blog/how-long-does-app-review-take" },
      { claim: "Access tokens expire after one hour, so implement a refresh flow", result: "corrected", note: "The one-hour expiry is documented (it was labelled inferred), but the docs say Zoom does not require a separate refresh flow. Advice rewritten.", source: "https://developers.zoom.us/docs/integrations/oauth" },
    ],
  },
  {
    slug: "docusign",
    checked: "2026-10-19",
    learned: "Research changed the plan: DocuSign was picked as a free 'sandbox then go-live' example, but its Go-Live page requires a paid production account (ISV partners may qualify for a free one). It was moved out of the library and kept as a generated guide.",
    items: [
      { claim: "Go-Live needs a paid production account", result: "confirmed", note: "Go-Live page: 'You have a paid production account to manage the integration in production.'", source: "https://developers.docusign.com/platform/go-live" },
      { claim: "Secrets and redirect URIs are not copied to production at Go-Live", result: "confirmed", note: "Go-Live page states both must be configured again after promotion.", source: "https://developers.docusign.com/platform/go-live" },
      { claim: "Manual Go-Live reviews take 24 to 48 hours", result: "confirmed", note: "Go-Live page: 'Manual reviews are typically completed within 24-48 hours.'", source: "https://developers.docusign.com/platform/go-live" },
      { claim: "20 successful demo API calls are needed for Go-Live", result: "not found", note: "Not on the eSign Go-Live page; the self-check had already downgraded it to inferred.", source: "https://developers.docusign.com/platform/go-live" },
    ],
  },
];

export const auditFor = (slug: string) => AUDITS.find((a) => a.slug === slug);
