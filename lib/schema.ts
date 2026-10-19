import { z } from "zod";

/** Every claim carries where it came from. */
export const Evidence = z.object({
  status: z.enum(["verified_live", "documented", "inferred"]),
  source_url: z.string().optional(),
  note: z.string().optional(),
});

const Claim = z.object({ item: z.string(), detail: z.string(), evidence: Evidence });

export const Guide = z.object({
  app: z.object({
    name: z.string(),
    website: z.string(),
    category: z.string(),
    developer_portal: z.string().optional(),
    composio: z.object({ slug: z.string().optional(), managed_oauth: z.boolean().nullable(), note: z.string() }),
  }),
  verdict: z.object({
    difficulty: z.enum(["easy", "moderate", "involved", "hard"]),
    headline: z.string(),
    setup_minutes: z.object({ min: z.number(), max: z.number() }),
    approval: z.object({
      required_for_your_users: z.boolean(),
      min_days: z.number().nullable(),
      max_days: z.number().nullable(),
      note: z.string(),
    }),
  }),
  prerequisites: z.array(Claim),
  steps: z.array(z.object({ title: z.string(), detail: z.string(), evidence: Evidence })),
  requirements: z.array(Claim),
  review: z.object({
    required: z.boolean(),
    when: z.string(),
    what_they_check: z.array(z.string()),
    duration: z.string(),
    evidence: Evidence,
  }),
  gotchas: z.array(Claim),
  blockers: z.array(z.object({ blocker: z.string(), how_to_proceed: z.string(), evidence: Evidence })),
  agent_vs_you: z.object({ agent_can: z.array(z.string()), you_must: z.array(z.string()) }),
  live_checks: z.array(z.object({ check: z.string(), result: z.string(), passed: z.boolean() })),
  uncertain: z.array(z.string()),
});
export type Guide = z.infer<typeof Guide>;

export type StoredGuide = {
  slug: string;
  appName: string;
  website: string | null;
  status: "ready" | "generating" | "failed";
  inLibrary: boolean;
  guide: (Guide & { sources?: { url: string; title: string }[]; checked_at?: string; verification?: Verification }) | null;
  costUsd: number;
  seconds: number | null;
  model: string | null;
  updatedAt: string;
};

export type Verification = {
  checked_claims: number;
  downgraded: { claim: string; from: string; reason: string }[];
};

export const slugify = (s: string) =>
  s.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\.(com|io|co|net|org|dev|app|ai)(\/.*)?$/, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
