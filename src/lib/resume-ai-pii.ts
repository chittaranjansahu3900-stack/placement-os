const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?<!\d)(?:\+?91[-.\s]?)?[6-9]\d{4}[-.\s]?\d{5}(?!\d)/g;
const URL_PATTERN = /https?:\/\/[^\s)\]}>,]+/gi;

export type PiiMask = {
  maskedText: string;
  replacements: Map<string, string>;
};

function collectMatches(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[0]).filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function maskResumePii(text: string, knownValues: Array<string | null | undefined>): PiiMask {
  const candidates = new Set(
    [
      ...knownValues,
      ...collectMatches(text, EMAIL_PATTERN),
      ...collectMatches(text, PHONE_PATTERN),
      ...collectMatches(text, URL_PATTERN),
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value && value.length >= 3)),
  );
  const replacements = new Map<string, string>();
  let maskedText = text;

  [...candidates]
    .sort((left, right) => right.length - left.length)
    .forEach((value, index) => {
      const token = `[[PLACEMENTOS_PII_${String(index + 1).padStart(4, "0")}]]`;
      const pattern = new RegExp(escapeRegExp(value), "gi");
      if (!pattern.test(maskedText)) return;
      pattern.lastIndex = 0;
      maskedText = maskedText.replace(pattern, token);
      replacements.set(token, value);
    });

  return { maskedText, replacements };
}

export function unmaskResumePii(text: string, replacements: Map<string, string>): string {
  let restored = text;
  for (const [token, value] of replacements) restored = restored.replaceAll(token, value);
  return restored;
}
