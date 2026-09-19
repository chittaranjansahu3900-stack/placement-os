import "server-only";

import { FIT_INTERPRET_SYSTEM_PROMPT, FIT_SYSTEM_PROMPT, buildFitUserPrompt } from "@/lib/fit/prompt";
import { parseFitBrief, reconcileVerdict, type FitBrief, type FitCriterion } from "@/lib/fit/schema";

// Fit briefs are the one place in PlacementOS where model quality is the feature: evidence
// discipline, ownership-vs-participation judgment, and refusing to infer credentials. Default to
// the strongest generally available model; make it overridable per environment, never per request.
const DEFAULT_MODEL = "claude-fable-5-1";

export function fitAiEnabled(): boolean {
  return process.env.FIT_AI_ENABLED?.trim().toLowerCase() === "true";
}

export function fitModel(): string {
  return process.env.ANTHROPIC_FIT_MODEL?.trim() || process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

async function messages(system: string, user: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("Claude is not configured");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: fitModel(),
      max_tokens: maxTokens,
      temperature: 0,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!response.ok) throw new Error(`Claude request failed (${response.status})`);
  const payload = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
  const output = payload.content
    ?.filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .trim();
  if (!output) throw new Error("Claude returned an empty response");
  return output;
}

export async function generateFitBrief(
  criteria: FitCriterion[],
  packetText: string,
  roleTitle: string,
  hasWorkHistory: boolean,
): Promise<{ brief: FitBrief; model: string }> {
  const raw = await messages(FIT_SYSTEM_PROMPT, buildFitUserPrompt(criteria, packetText, roleTitle), 2_500);
  const brief = parseFitBrief(raw, criteria, packetText);
  brief.verdict = reconcileVerdict(brief, hasWorkHistory);
  return { brief, model: fitModel() };
}

export async function interpretCriteria(criteria: FitCriterion[]): Promise<Record<string, string>> {
  const user = criteria.map((c) => `- ${c.id} (${c.kind}): ${c.text}`).join("\n");
  const raw = await messages(FIT_INTERPRET_SYSTEM_PROMPT, user, 1_200);
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()) as {
      interpretations?: Array<{ id?: string; interpretation?: string }>;
    };
    const out: Record<string, string> = {};
    for (const row of parsed.interpretations ?? []) {
      if (typeof row.id === "string" && typeof row.interpretation === "string") {
        out[row.id] = row.interpretation.trim().slice(0, 300);
      }
    }
    return out;
  } catch {
    return {};
  }
}
