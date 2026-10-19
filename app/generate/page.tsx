"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

type Line = { type: string; text?: string; url?: string; title?: string; passed?: boolean };

function Live() {
  const app = useSearchParams().get("app") ?? "";
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [status, setStatus] = useState("Starting");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ slug: string; cost?: number; seconds?: number } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!app || started.current) return;
    started.current = true;
    (async () => {
      const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app }) });
      if (!res.ok || !res.body) {
        setError((await res.json().catch(() => ({}))).error ?? "Could not start the agent");
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n");
        buf = parts.pop() ?? "";
        for (const p of parts) {
          if (!p.trim()) continue;
          const e = JSON.parse(p) as Line & { slug?: string; cost?: number; seconds?: number };
          if (e.type === "status") setStatus(e.text ?? "");
          else if (e.type === "cached") { router.replace(`/guides/${e.slug}`); return; }
          else if (e.type === "done") { setDone({ slug: e.slug!, cost: e.cost, seconds: e.seconds }); setStatus("Done"); }
          else if (e.type === "error") setError(e.text ?? "Something went wrong");
          else setLines((l) => [...l, e]);
        }
      }
    })().catch((e) => setError(String(e)));
  }, [app, router]);

  if (!app) return <p>Enter an app on the <Link href="/">home page</Link>.</p>;
  return (
    <main className="live">
      <h1 style={{ margin: 0, fontSize: 28, letterSpacing: "-0.02em" }}>Researching {app}</h1>
      <p className="hint" style={{ margin: 0 }}>
        The agent searches the provider&apos;s developer docs, reads the pages that matter, probes the OAuth endpoints live, checks
        Composio&apos;s toolkit docs, then compares its own claims with the sources.
      </p>
      <div className="log" aria-live="polite">
        {lines.map((l, i) => (
          <div key={i}>
            <span className="k">{l.type === "source" ? "source" : l.type === "check" ? "live check" : "step"}</span>
            {l.type === "source" ? <span className="src"><a href={l.url} target="_blank" rel="noopener noreferrer">{l.title || l.url}</a></span>
              : l.type === "check" ? <span className={l.passed ? "ok" : "bad"}>{l.text}</span>
              : <span>{l.text}</span>}
          </div>
        ))}
        {!done && !error && <div><span className="k">now</span><span className="pulse">{status}…</span></div>}
      </div>
      {error && <p className="err">{error}</p>}
      {done && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Link className="btn primary" href={`/guides/${done.slug}`}>Open the guide</Link>
          <span className="hint">Finished in {done.seconds}s for ${done.cost?.toFixed(2)}</span>
        </div>
      )}
    </main>
  );
}

export default function GeneratePage() {
  return <Suspense><Live /></Suspense>;
}
