import type { Guide, StoredGuide } from "./schema";

export const DIFFICULTY: Record<Guide["verdict"]["difficulty"], { label: string; blurb: string }> = {
  easy: { label: "Easy", blurb: "Self-serve, no review" },
  moderate: { label: "Moderate", blurb: "Self-serve with requirements" },
  involved: { label: "Involved", blurb: "Review or program before real users" },
  hard: { label: "Hard", blurb: "Long review or security assessment" },
};

export const EVIDENCE_LABEL = { verified_live: "Verified live", documented: "Documented", inferred: "Inferred" } as const;

export function minutes(r: { min: number; max: number }) {
  const f = (m: number) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10} h` : `${m} min`);
  return r.min === r.max ? f(r.min) : `${f(r.min)} to ${f(r.max)}`;
}

export function approvalWait(a: Guide["verdict"]["approval"]) {
  if (!a.required_for_your_users) return "None";
  if (a.min_days == null && a.max_days == null) return "Required, timeline not published";
  const d = (n: number) => (n < 1 ? "under a day" : n === 1 ? "1 day" : n % 7 === 0 && n >= 14 ? `${n / 7} weeks` : `${n} days`);
  if (a.min_days != null && a.max_days != null && a.min_days !== a.max_days) return `${d(a.min_days)} to ${d(a.max_days)}`;
  return d((a.max_days ?? a.min_days)!);
}

export function evidenceCounts(g: Guide) {
  const all = [...g.prerequisites, ...g.steps, ...g.requirements, ...g.gotchas, ...g.blockers, g.review].map((c) => c.evidence.status);
  return {
    verified_live: all.filter((s) => s === "verified_live").length + g.live_checks.filter((c) => c.passed).length,
    documented: all.filter((s) => s === "documented").length,
    inferred: all.filter((s) => s === "inferred").length,
  };
}

/** Plain Markdown version for sharing in a PR, ticket or chat. */
export function toMarkdown(s: StoredGuide, url: string) {
  const g = s.guide!;
  const ev = (e: { status: string; source_url?: string }) => ` _(${EVIDENCE_LABEL[e.status as keyof typeof EVIDENCE_LABEL]}${e.source_url ? `: ${e.source_url}` : ""})_`;
  const lines = [
    `# ${g.app.name}: OAuth app setup guide`,
    ``,
    `**${DIFFICULTY[g.verdict.difficulty].label}.** ${g.verdict.headline}`,
    ``,
    `- Hands-on setup: ${minutes(g.verdict.setup_minutes)}`,
    `- Approval wait before your users can connect: ${approvalWait(g.verdict.approval)}. ${g.verdict.approval.note}`,
    `- Composio: ${g.app.composio.managed_oauth === true ? "managed OAuth app available" : g.app.composio.managed_oauth === false ? "bring your own OAuth app" : "not listed"}. ${g.app.composio.note}`,
    ``,
    `## Before you start`,
    ...g.prerequisites.map((p) => `- **${p.item}**: ${p.detail}${ev(p.evidence)}`),
    ``,
    `## Steps`,
    ...g.steps.map((st, i) => `${i + 1}. **${st.title}**: ${st.detail}${ev(st.evidence)}`),
    ``,
    `## Requirements`,
    ...g.requirements.map((p) => `- **${p.item}**: ${p.detail}${ev(p.evidence)}`),
    ``,
    `## Review`,
    `${g.review.required ? "Required" : "Not required"}: ${g.review.when}. Duration: ${g.review.duration}.${g.review.what_they_check.length ? ` They check: ${g.review.what_they_check.join("; ")}.` : ""}${ev(g.review.evidence)}`,
    ``,
    `## Gotchas`,
    ...g.gotchas.map((p) => `- **${p.item}**: ${p.detail}${ev(p.evidence)}`),
    ...(g.blockers.length ? [``, `## If you get stuck`, ...g.blockers.map((b) => `- **${b.blocker}**: ${b.how_to_proceed}${ev(b.evidence)}`)] : []),
    ``,
    `## What an agent can do, and what you must do`,
    ...g.agent_vs_you.agent_can.map((x) => `- Agent: ${x}`),
    ...g.agent_vs_you.you_must.map((x) => `- You: ${x}`),
    ``,
    `## Live checks`,
    ...g.live_checks.map((c) => `- ${c.passed ? "Passed" : "Failed"}: ${c.check}. ${c.result}`),
    ...(g.uncertain.length ? [``, `## Not verified`, ...g.uncertain.map((u) => `- ${u}`)] : []),
    ``,
    `Sources: ${(g.sources ?? []).map((x) => x.url).join(", ")}`,
    `Checked ${g.checked_at?.slice(0, 10) ?? ""} by OAuth Runway: ${url}`,
  ];
  return lines.join("\n");
}
