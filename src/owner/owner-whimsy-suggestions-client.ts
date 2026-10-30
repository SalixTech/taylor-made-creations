import { collection, getDocs, limit, query } from "firebase/firestore/lite";
import { taylorOwnerSession } from "./taylor-services-client";
import { addOwnerWhimsyTerm, type WhimsyTermResult } from "./owner-whimsy";
import { extractWhimsySpeciesSuggestions, WHIMSY_SPECIES_READ_LIMIT } from "./owner-whimsy-suggestions";
export type WhimsySpeciesReview = { words: readonly string[]; add: (word: string, isCurrent?: () => boolean) => Promise<WhimsyTermResult> };
/** Explicit, owner-only read. Nothing is logged or persisted by this review.
 * Full records exist only during extraction; the returned closure keeps words,
 * never request IDs, names, emails, descriptions, references or raw answers. */
export async function readOwnerWhimsySpeciesSuggestions(isCurrent: () => boolean = () => true): Promise<WhimsySpeciesReview> {
  const session = await taylorOwnerSession();
  session.assertCurrent();
  if (!isCurrent()) throw new Error("This review is closed.");
  const snapshot = await getDocs(query(collection(session.db, "commissionRequests"), limit(WHIMSY_SPECIES_READ_LIMIT)));
  session.assertCurrent();
  if (!isCurrent()) throw new Error("This review is closed.");
  const words = Object.freeze(extractWhimsySpeciesSuggestions(snapshot.docs.slice(0, WHIMSY_SPECIES_READ_LIMIT).map(document => document.data())));
  return { words, async add(word, isCurrent = () => true) {
    if (!words.includes(word)) throw new Error("Choose a word from this review or enter your own custom word.");
    session.assertCurrent();
    // An expired or revoked session must not promote a previously loaded suggestion.
    const current = await taylorOwnerSession();
    session.assertCurrent(); current.assertCurrent();
    if (!isCurrent()) throw new Error("This review is closed.");
    return addOwnerWhimsyTerm(word);
  } };
}
