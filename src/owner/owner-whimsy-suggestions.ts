import { MAX_CUSTOM_WHIMSY_TERMS, normalizeWhimsyTerm, WHIMSICAL_CLIENT_WORDS } from "./owner-whimsy";
export const WHIMSY_SPECIES_READ_LIMIT = 50;
/** Only the canonical, server-cleaned species field is eligible. Never infer from
 * names, descriptions, user-editable question labels, references or contact data. */
export function extractWhimsySpeciesSuggestions(records: readonly unknown[]): string[] {
  const words: string[] = [];
  for (const record of records.slice(0, WHIMSY_SPECIES_READ_LIMIT)) {
    if (!record || typeof record !== "object" || Array.isArray(record) || !Object.hasOwn(record, "submitted")) continue;
    const submitted = (record as Record<string, unknown>).submitted;
    if (!submitted || typeof submitted !== "object" || Array.isArray(submitted) || !Object.hasOwn(submitted, "species")) continue;
    const word = normalizeWhimsyTerm((submitted as Record<string, unknown>).species);
    if (!word || [...WHIMSICAL_CLIENT_WORDS, ...words].some(existing => existing.toLocaleLowerCase() === word.toLocaleLowerCase())) continue;
    words.push(word);
    if (words.length === MAX_CUSTOM_WHIMSY_TERMS) break;
  }
  return words;
}
