import Link from "next/link";
import { AUDITS } from "@/lib/audit";
import { getGuides } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function HowWeChecked() {
  const guides = await getGuides();
  const name = (slug: string) => guides.find((g) => g.slug === slug)?.guide?.app.name ?? slug;
  const all = AUDITS.flatMap((a) => a.items);
  const count = (r: string) => all.filter((i) => i.result === r).length;
  const selfChecked = guides.filter((g) => g.inLibrary).reduce((s, g) => s + (g.guide?.verification?.checked_claims ?? 0), 0);
  const selfDowngraded = guides.filter((g) => g.inLibrary).reduce((s, g) => s + (g.guide?.verification?.downgraded.length ?? 0), 0);

  return (
    <main className="prose" style={{ maxWidth: 860 }}>
      <h1 style={{ fontSize: 30, letterSpacing: "-0.02em", marginBottom: 8 }}>How we checked</h1>
      <p>Every guide goes through three layers of checking, and each claim carries the strongest evidence it actually has.</p>

      <h2>1. Live checks, in every run</h2>
      <p>The agent probes the provider&apos;s OAuth discovery document and calls its authorization endpoint with a made-up client.
        A live endpoint answers with an error or a redirect to sign in; that response is recorded as <em>verified live</em>.</p>

      <h2>2. Self-check, in every run</h2>
      <p>A second model reads each page the guide cites and checks every claim labelled <em>documented</em> against it. Claims
        the page does not support are downgraded to <em>inferred</em> and listed under &ldquo;Not verified&rdquo;. Across the
        library: <strong>{selfChecked}</strong> documented claims checked, <strong>{selfDowngraded}</strong> downgraded.</p>

      <h2>3. Manual audit, on a sample</h2>
      <p>We checked {all.length} claims by hand against the providers&apos; own docs: <strong>{count("confirmed")} confirmed</strong>,{" "}
        <strong>{count("corrected")} corrected</strong>, <strong>{count("not found")} not found</strong> in the cited source.
        What we found shaped the agent: it is better at finding registration steps than review policy, it sometimes under-labels
        documented facts, and the self-check occasionally misses an unsupported claim, which is why the manual layer exists.</p>

      {AUDITS.map((a) => (
        <section key={a.slug} style={{ marginTop: 24 }}>
          <h2 style={{ marginBottom: 6 }}><Link href={`/guides/${a.slug}`}>{name(a.slug)}</Link></h2>
          <p className="hint" style={{ marginTop: 0 }}>{a.learned}</p>
          <div className="scroll">
            <table className="table">
              <thead><tr><th>Claim</th><th>Result</th><th>What the source says</th></tr></thead>
              <tbody>
                {a.items.map((i) => (
                  <tr key={i.claim}>
                    <td>{i.claim}</td>
                    <td style={{ whiteSpace: "nowrap" }}><span className={`pill ${i.result === "confirmed" ? "d-easy" : i.result === "corrected" ? "d-moderate" : "d-involved"}`}>{i.result}</span></td>
                    <td>{i.note} <a href={i.source} target="_blank" rel="noopener noreferrer">source</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <h2>What we would do at 100 apps</h2>
      <ul>
        <li>Re-run every guide on a schedule and diff the verdicts, so a provider changing its review policy shows up as a change, not a stale page.</li>
        <li>Turn each manual correction into a check the agent runs (for example, &ldquo;look for token lifetime in the OAuth reference&rdquo;).</li>
        <li>Let developers flag a step that didn&apos;t match their console, and route those to a human re-check.</li>
      </ul>
    </main>
  );
}
