import Link from "next/link";
import { notFound } from "next/navigation";
import { auditFor } from "@/lib/audit";
import { getGuide } from "@/lib/data";
import { DIFFICULTY, EVIDENCE_LABEL, approvalWait, evidenceCounts, minutes, toMarkdown } from "@/lib/format";
import type { Guide } from "@/lib/schema";
import CopyButton from "./copy-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const g = await getGuide((await params).slug);
  return { title: g?.guide ? `${g.guide.app.name} OAuth app guide | OAuth Runway` : "OAuth Runway" };
}

function Ev({ e }: { e: Guide["review"]["evidence"] }) {
  return (
    <span className="ev">
      <span><i className={`dot e-${e.status}`} />{EVIDENCE_LABEL[e.status]}</span>
      {e.source_url && <a href={e.source_url} target="_blank" rel="noopener noreferrer">{e.source_url.replace(/^https?:\/\//, "").slice(0, 70)}</a>}
      {e.note && <span>{e.note}</span>}
    </span>
  );
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const s = await getGuide((await params).slug);
  if (!s?.guide || s.status !== "ready") notFound();
  const g = s.guide;
  const d = g.verdict.difficulty;
  const ev = evidenceCounts(g);
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const md = toMarkdown(s, `${base}/guides/${s.slug}`);
  const comp = g.app.composio.managed_oauth;
  const audit = auditFor(s.slug);

  return (
    <main className="guide">
      <article>
        <p className="hint"><Link href="/">Library</Link> / {g.app.name}</p>
        <h1>{g.app.name}</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className={`pill d-${d}`}>{DIFFICULTY[d].label}: {DIFFICULTY[d].blurb}</span>
          <span className="badge">{g.app.category}</span>
          <span className="badge">Composio: {comp === true ? "managed OAuth available" : comp === false ? "bring your own OAuth app" : "not a toolkit yet"}</span>
        </div>

        <section className="verdict" aria-label="Verdict">
          <p className="headline">{g.verdict.headline}</p>
          <div className="times">
            <div><span>Hands-on setup</span><b>{minutes(g.verdict.setup_minutes)}</b></div>
            <div><span>Approval wait for real users</span><b>{approvalWait(g.verdict.approval)}</b></div>
            <div><span>Evidence</span><b style={{ fontSize: 14, fontWeight: 500 }}>{ev.verified_live} verified live · {ev.documented} documented · {ev.inferred} inferred</b></div>
          </div>
          <p className="hint" style={{ margin: 0 }}>{g.verdict.approval.note}</p>
        </section>

        <section className="block"><h2>Before you start</h2>
          <ul className="items">{g.prerequisites.map((p, i) => <li key={i}><strong>{p.item}</strong><span>{p.detail}</span><Ev e={p.evidence} /></li>)}</ul>
        </section>

        <section className="block"><h2>Steps</h2>
          <ol className="items steps">{g.steps.map((st, i) => <li key={i}><strong>{st.title}</strong><span>{st.detail}</span><Ev e={st.evidence} /></li>)}</ol>
        </section>

        <section className="block"><h2>Requirements</h2>
          <ul className="items">{g.requirements.map((p, i) => <li key={i}><strong>{p.item}</strong><span>{p.detail}</span><Ev e={p.evidence} /></li>)}</ul>
        </section>

        <section className="block"><h2>Review and approval</h2>
          <ul className="items"><li>
            <strong>{g.review.required ? "Required" : "Not required"}: {g.review.when}</strong>
            <span>Duration: {g.review.duration}</span>
            {g.review.what_they_check.length > 0 && <span>They check: {g.review.what_they_check.join("; ")}</span>}
            <Ev e={g.review.evidence} />
          </li></ul>
        </section>

        {g.gotchas.length > 0 && (
          <section className="block"><h2>Gotchas</h2>
            <ul className="items">{g.gotchas.map((p, i) => <li key={i}><strong>{p.item}</strong><span>{p.detail}</span><Ev e={p.evidence} /></li>)}</ul>
          </section>
        )}

        {g.blockers.length > 0 && (
          <section className="block"><h2>If you get stuck</h2>
            <ul className="items">{g.blockers.map((b, i) => <li key={i}><strong>{b.blocker}</strong><span>{b.how_to_proceed}</span><Ev e={b.evidence} /></li>)}</ul>
          </section>
        )}

        <section className="block"><h2>What an agent can do, and what you must do</h2>
          <div className="two">
            <ul className="items"><li><strong>An agent can</strong>{g.agent_vs_you.agent_can.map((x, i) => <span key={i}>{x}</span>)}</li></ul>
            <ul className="items"><li><strong>Only you can</strong>{g.agent_vs_you.you_must.map((x, i) => <span key={i}>{x}</span>)}</li></ul>
          </div>
        </section>

        {g.uncertain.length > 0 && (
          <section className="block"><h2>Not verified</h2>
            <ul className="items uncertain">{g.uncertain.map((u, i) => <li key={i}><span>{u}</span></li>)}</ul>
          </section>
        )}
      </article>

      <aside className="side">
        <div className="panel">
          <h3>Share</h3>
          <CopyButton text={md} label="Copy as Markdown" />
          <span className="hint">Checked {g.checked_at ? new Date(g.checked_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""} · {Math.round(s.seconds ?? 0)}s · ${s.costUsd.toFixed(2)}</span>
        </div>
        <div className="panel">
          <h3>Live checks</h3>
          {g.live_checks.map((c, i) => (
            <div key={i}><span className={c.passed ? "check-pass" : "check-fail"}>{c.passed ? "Passed" : "Failed"}</span> {c.check}<div className="hint">{c.result}</div></div>
          ))}
        </div>
        {g.verification && (
          <div className="panel">
            <h3>Self-check</h3>
            <span>{g.verification.checked_claims} documented claims compared with their sources; {g.verification.downgraded.length} downgraded to inferred.</span>
          </div>
        )}
        {audit && (
          <div className="panel">
            <h3>Manual audit</h3>
            <span>{audit.items.length} claims checked by hand: {audit.items.filter((i) => i.result === "confirmed").length} confirmed,{" "}
              {audit.items.filter((i) => i.result === "corrected").length} corrected, {audit.items.filter((i) => i.result === "not found").length} not found.</span>
            <Link href="/how-we-checked">See the audit</Link>
          </div>
        )}
        <div className="panel">
          <h3>Sources read</h3>
          <ul>{(g.sources ?? []).map((x) => <li key={x.url}><a href={x.url} target="_blank" rel="noopener noreferrer">{x.title || x.url}</a></li>)}</ul>
        </div>
      </aside>
    </main>
  );
}
