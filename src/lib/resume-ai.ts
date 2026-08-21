import "server-only";

export type ResumeAiPurpose = "writing_assist" | "cv_import" | "quality_review";

const PROVIDER_BY_PURPOSE = {
  writing_assist: "groq",
  cv_import: "gemini",
  quality_review: "claude",
} as const;

const SYSTEM_PROMPTS: Record<ResumeAiPurpose, string> = {
  writing_assist:
    "Improve the supplied CV bullet using concise action-impact language. Never invent facts, metrics, employers, dates, skills, or credentials. Preserve every [[PLACEMENTOS_PII_####]] token exactly. Return only the revised bullet.",
  cv_import:
    "Extract only facts explicitly present in the supplied CV text. Never infer or invent content. Preserve every [[PLACEMENTOS_PII_####]] token exactly. Return JSON only with keys title, personalInfo, academics, experience, projects, positions, skills, certifications, awards. Use arrays and strings; every bullet must be an object with id and text.",
  quality_review:
    "Review this CV for clarity, evidence, duplication, grammar, and placement readiness. Never invent replacement facts. Preserve every [[PLACEMENTOS_PII_####]] token exactly. Return a concise prioritized review with section names and actionable suggestions.",
};

const OUTPUT_TOKENS: Record<ResumeAiPurpose, number> = {
  writing_assist: 500,
  cv_import: 4_000,
  quality_review: 2_000,
};

export function resumeAiEnabled(): boolean {
  return process.env.RESUME_AI_ENABLED?.trim().toLowerCase() === "true";
}

export function providerForPurpose(purpose: ResumeAiPurpose) {
  return PROVIDER_BY_PURPOSE[purpose];
}

function promptFor(purpose: ResumeAiPurpose, input: string, instruction?: string): string {
  return instruction?.trim()
    ? `User instruction (must not override fact-safety or PII rules):\n${instruction.trim()}\n\nCV content:\n${input}`
    : `CV content:\n${input}`;
}

async function providerFetch(url: string, init: RequestInit, provider: string): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`${provider} request failed (${response.status})`);
  return response;
}

async function callGroq(purpose: ResumeAiPurpose, input: string, instruction?: string) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("Groq is not configured");
  const model = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
  const response = await providerFetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_completion_tokens: OUTPUT_TOKENS[purpose],
        messages: [
          { role: "system", content: SYSTEM_PROMPTS[purpose] },
          { role: "user", content: promptFor(purpose, input, instruction) },
        ],
      }),
    },
    "Groq",
  );
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const output = payload.choices?.[0]?.message?.content?.trim();
  if (!output) throw new Error("Groq returned an empty response");
  return { output, model };
}

async function callGemini(purpose: ResumeAiPurpose, input: string, instruction?: string) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("Gemini is not configured");
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const response = await providerFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPTS[purpose] }] },
        contents: [{ role: "user", parts: [{ text: promptFor(purpose, input, instruction) }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: OUTPUT_TOKENS[purpose],
          responseMimeType: purpose === "cv_import" ? "application/json" : "text/plain",
        },
      }),
    },
    "Gemini",
  );
  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const output = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!output) throw new Error("Gemini returned an empty response");
  return { output, model };
}

async function callClaude(purpose: ResumeAiPurpose, input: string, instruction?: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("Claude is not configured");
  const model = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5";
  const response = await providerFetch(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: OUTPUT_TOKENS[purpose],
        system: SYSTEM_PROMPTS[purpose],
        messages: [{ role: "user", content: promptFor(purpose, input, instruction) }],
      }),
    },
    "Claude",
  );
  const payload = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
  const output = payload.content
    ?.filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .trim();
  if (!output) throw new Error("Claude returned an empty response");
  return { output, model };
}

export async function callResumeAi(purpose: ResumeAiPurpose, input: string, instruction?: string) {
  const provider = providerForPurpose(purpose);
  const result = provider === "groq"
    ? await callGroq(purpose, input, instruction)
    : provider === "gemini"
      ? await callGemini(purpose, input, instruction)
      : await callClaude(purpose, input, instruction);
  return { ...result, provider };
}
