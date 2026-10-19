"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AskBox() {
  const [app, setApp] = useState("");
  const router = useRouter();
  return (
    <form className="ask" onSubmit={(e) => { e.preventDefault(); if (app.trim()) router.push(`/generate?app=${encodeURIComponent(app.trim())}`); }}>
      <input id="app" aria-label="App name or website" placeholder="Any app: name or website, e.g. Calendly or pipedrive.com"
        value={app} onChange={(e) => setApp(e.target.value)} maxLength={120} />
      <button className="btn primary" type="submit" disabled={!app.trim()}>Research it live</button>
      <span className="hint" style={{ flexBasis: "100%" }}>An agent reads the provider&apos;s docs, probes its OAuth endpoints and writes a guide in about two minutes.</span>
    </form>
  );
}
