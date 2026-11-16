/**
 * Splits a short notice into sentences so each can start on its own line.
 * A sentence ends at . ? ! followed by a space; "4.5MB" or "1,000원." at the end stay whole.
 */
export function splitSentences(text: string): string[] {
  return text.split(/(?<=[.?!])\s+(?=\S)/).map((part) => part.trim()).filter(Boolean);
}
