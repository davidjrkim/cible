// Single source of truth for the "AI tells" filter.
// - The runtime route applies stripAiTells() when removeAiTells=true (safety net).
// - The writer prompts include AI_TELL_INSTRUCTION when removeAiTells=true so the
//   model actually changes behavior instead of relying on the filter.
// - The eval pipeline runs aiTellCheck() on the *pre-strip* model output so a
//   passing eval means the model obeyed, not that the filter cleaned up after it.

export const AI_TELL_WORDS = [
  "delve",
  "leverage",
  "tapestry",
  "underscore",
  "moreover",
  "furthermore",
  "navigate",
  "realm",
  "elevate",
  "seamlessly",
  "robust",
  "pivotal",
];

export const AI_TELL_INSTRUCTION = `Avoid these AI-tell tokens entirely: em dashes (—), and the words ${AI_TELL_WORDS.map((w) => `"${w}"`).join(", ")}. Use plain prose with regular punctuation.`;

export function stripAiTells(text: string): string {
  let out = text.replace(/—/g, ", ");
  for (const w of AI_TELL_WORDS) {
    out = out.replace(new RegExp(`\\b${w}\\b`, "gi"), "");
  }
  return out.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
}

export type AiTellCheck = { pass: boolean; offending_tokens: string[] };

export function aiTellCheck(text: string): AiTellCheck {
  const hits = new Set<string>();
  if (text.includes("—")) hits.add("—");
  for (const w of AI_TELL_WORDS) {
    if (new RegExp(`\\b${w}\\b`, "i").test(text)) hits.add(w.toLowerCase());
  }
  return { pass: hits.size === 0, offending_tokens: [...hits] };
}
