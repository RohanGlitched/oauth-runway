"use client";

import { useState } from "react";

export default function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button className="btn" onClick={async () => {
      try { await navigator.clipboard.writeText(text.replace(/\]\(\//g, `](${location.origin}/`)); setState("copied"); }
      catch { setState("failed"); }
      setTimeout(() => setState("idle"), 1800);
    }}>
      {state === "copied" ? "Copied" : state === "failed" ? "Copy blocked by browser" : label}
    </button>
  );
}
