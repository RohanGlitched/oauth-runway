import "server-only";
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
  type Tool,
} from "@aws-sdk/client-bedrock-runtime";
import { ensureSchema, sql } from "./db";

// USD per million tokens (input, output). 5.5 prices are not known to us yet: set high so the cap errs safe.
const PRICES: Record<string, [number, number]> = {
  "au.anthropic.claude-sonnet-5-5": [6, 30],
  "au.anthropic.claude-sonnet-4-5-20250929-v1:0": [3, 15],
  "global.anthropic.claude-sonnet-4-5-20250929-v1:0": [3, 15],
  "au.anthropic.claude-haiku-5-5": [2, 10],
  "au.anthropic.claude-haiku-4-5-20251001-v1:0": [1, 5],
  "global.anthropic.claude-haiku-4-5-20251001-v1:0": [1, 5],
};
const TIERS = {
  smart: ["au.anthropic.claude-sonnet-5-5", "au.anthropic.claude-sonnet-4-5-20250929-v1:0", "global.anthropic.claude-sonnet-4-5-20250929-v1:0"],
  fast: ["au.anthropic.claude-haiku-5-5", "au.anthropic.claude-haiku-4-5-20251001-v1:0", "global.anthropic.claude-haiku-4-5-20251001-v1:0",
    "au.anthropic.claude-sonnet-4-5-20250929-v1:0"],
};
export const MONTHLY_CAP = Number(process.env.AGENT_MONTHLY_CAP_USD ?? "3");
export const DAILY_CAP = Number(process.env.AGENT_DAILY_CAP_USD ?? "1.5");

export class BudgetExceeded extends Error {}

const client = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION ?? "ap-southeast-2",
  credentials: { accessKeyId: process.env.BEDROCK_ACCESS_KEY_ID!, secretAccessKey: process.env.BEDROCK_SECRET_ACCESS_KEY! },
});
const unavailable = new Set<string>();
const busyUntil = new Map<string, number>();

export async function spend() {
  await ensureSchema();
  const [r] = await sql`select
      coalesce(sum(usd) filter (where ts >= date_trunc('month', now())), 0) as month,
      coalesce(sum(usd) filter (where ts >= date_trunc('day', now())), 0) as day
    from llm_calls`;
  return { month: Number(r.month), day: Number(r.day) };
}

async function guard(model: string, estIn: number, maxOut: number) {
  const [pin, pout] = PRICES[model];
  const worst = (estIn * pin + maxOut * pout) / 1e6;
  const s = await spend();
  if (s.month + worst > MONTHLY_CAP) throw new BudgetExceeded(`Monthly agent budget of $${MONTHLY_CAP} reached`);
  if (s.day + worst > DAILY_CAP) throw new BudgetExceeded(`Daily agent budget of $${DAILY_CAP} reached; try again tomorrow`);
}

/** Adds a cache point after the last message so the next round re-reads this prefix from cache. */
function withCachePoint(messages: Message[]): Message[] {
  if (!messages.length) return messages;
  const last = messages[messages.length - 1];
  return [...messages.slice(0, -1), { ...last, content: [...(last.content ?? []), { cachePoint: { type: "default" } } as ContentBlock] }];
}

export type Turn = { text: string; toolUses: { id: string; name: string; input: Record<string, unknown> }[]; message: Message; usd: number; model: string };

/** One Converse call with model fallback, spend guard and cost logging. */
export async function converse(opts: {
  tier: keyof typeof TIERS;
  system: string;
  messages: Message[];
  tools?: Tool[];
  maxTokens?: number;
  purpose: string;
  forceTool?: string;
}): Promise<Turn> {
  const estIn = Math.ceil(JSON.stringify(opts.messages).length / 3.2 + opts.system.length / 3.2);
  const maxOut = opts.maxTokens ?? 3000;
  let lastErr = "";
  for (const model of TIERS[opts.tier]) {
    if (unavailable.has(model) || (busyUntil.get(model) ?? 0) > Date.now()) continue;
    await guard(model, estIn, maxOut);
    try {
      const out = await client.send(new ConverseCommand({
        modelId: model,
        // Prompt caching: instructions, tool definitions and the conversation so far are re-read at ~10% of the price
        system: [{ text: opts.system }, { cachePoint: { type: "default" } }],
        messages: withCachePoint(opts.messages),
        inferenceConfig: { maxTokens: maxOut, temperature: 0.2 },
        ...(opts.tools ? { toolConfig: { tools: [...opts.tools, { cachePoint: { type: "default" } } as Tool],
          ...(opts.forceTool ? { toolChoice: { tool: { name: opts.forceTool } } } : {}) } } : {}),
      }));
      const [pin, pout] = PRICES[model];
      const u: { inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number; cacheWriteInputTokens?: number } = out.usage ?? {};
      const usd = ((u.inputTokens ?? 0) * pin + (u.cacheWriteInputTokens ?? 0) * pin * 1.25 + (u.cacheReadInputTokens ?? 0) * pin * 0.1 +
        (u.outputTokens ?? 0) * pout) / 1e6;
      await sql`insert into llm_calls (model, purpose, input, output, usd) values (${model}, ${opts.purpose}, ${u.inputTokens ?? 0}, ${u.outputTokens ?? 0}, ${usd})`;
      const message = out.output!.message!;
      const content: ContentBlock[] = message.content ?? [];
      return {
        text: content.map((c) => ("text" in c && c.text) || "").join(""),
        toolUses: content.filter((c) => "toolUse" in c && c.toolUse).map((c) => ({
          id: c.toolUse!.toolUseId!, name: c.toolUse!.name!, input: (c.toolUse!.input ?? {}) as Record<string, unknown>,
        })),
        message, usd, model,
      };
    } catch (e) {
      const err = e as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
      const code = err.$metadata?.httpStatusCode;
      lastErr = `${model}: ${err.name} ${err.message?.slice(0, 120)}`;
      if (err.name === "AccessDeniedException" || err.name === "ResourceNotFoundException" || /not available|agreement/i.test(err.message ?? "")) {
        unavailable.add(model);
        continue;
      }
      if (code === 429 || code === 503 || code === 500 || err.name === "ThrottlingException" || err.name === "ServiceUnavailableException") {
        busyUntil.set(model, Date.now() + 10 * 60_000);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`No model available: ${lastErr}`);
}
