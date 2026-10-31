"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { readStudioSettings, saveStudioSettings, useStudioSettings } from "./use-studio-settings";

const key = "tmc-owner-whimsy:a4ARjp0z8ZOByKlC2AfGzmMRj843";
const termsKey = `${key}:terms:v1`;
const changed = "tmc-owner-whimsy-changed";
let volatileChoice: boolean | null = null;
let volatileTerms: string | null = null;
export const WHIMSICAL_CLIENT_WORDS = Object.freeze(["Floof", "Scales", "Feathers", "Fluff", "Fuzz", "Paws"] as const);
export const MAX_CUSTOM_WHIMSY_TERMS = 24;
export const MAX_WHIMSY_TERM_LENGTH = 32;
const sameWord = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
export function normalizeWhimsyTerm(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 80 || /[\r\n\t]/.test(value)) return null;
  const word = value.normalize("NFC").trim().replace(/ +/g, " ");
  return word.length > 0 && [...word].length <= MAX_WHIMSY_TERM_LENGTH && /^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u.test(word) ? word : null;
}
function sanitizeTerms(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const terms: string[] = [];
  for (const item of value.slice(0, MAX_CUSTOM_WHIMSY_TERMS)) {
    const word = normalizeWhimsyTerm(item);
    if (word && !WHIMSICAL_CLIENT_WORDS.some(builtin => sameWord(builtin, word)) && !terms.some(existing => sameWord(existing, word))) terms.push(word);
  }
  return terms;
}
export function readLocalOwnerWhimsy(): boolean {
  if (volatileChoice !== null) return volatileChoice;
  if (typeof window !== "undefined") try { const saved = window.localStorage.getItem(key); if (saved === "on" || saved === "off") return saved === "on"; } catch { /* Optional cosmetic preference. */ }
  return true;
}
export function readOwnerWhimsy(): boolean { return readStudioSettings()?.whimsyEnabled ?? readLocalOwnerWhimsy(); }
export async function setOwnerWhimsy(enabled: boolean, expectedRevision?: number): Promise<boolean> { return saveStudioSettings({ whimsyEnabled: enabled }, false, expectedRevision); }
function readTermsSnapshot(): string {
  if (volatileTerms !== null) return volatileTerms;
  if (typeof window !== "undefined") try {
    const saved = window.localStorage.getItem(termsKey);
    if (saved && saved.length <= 4000) return JSON.stringify(sanitizeTerms(JSON.parse(saved)));
  } catch { /* Malformed or unavailable storage must not break the workspace. */ }
  return "[]";
}
export const readLocalOwnerWhimsyTerms = (): string[] => JSON.parse(readTermsSnapshot());
export const readOwnerWhimsyTerms = (): string[] => readStudioSettings()?.whimsyTerms ?? readLocalOwnerWhimsyTerms();
async function saveTerms(terms: string[]): Promise<boolean> { return saveStudioSettings({ whimsyTerms: sanitizeTerms(terms) }); }
export async function importLocalWhimsy(): Promise<boolean> { if (readStudioSettings()?.revision !== 0) return false; return saveStudioSettings({ whimsyEnabled: readLocalOwnerWhimsy(), whimsyTerms: readLocalOwnerWhimsyTerms() }); }
export type WhimsyTermResult = { saved: boolean; error?: string };
export async function addOwnerWhimsyTerm(input: unknown): Promise<WhimsyTermResult> {
  const word = normalizeWhimsyTerm(input);
  if (!word) return { saved: false, error: `Use up to ${MAX_WHIMSY_TERM_LENGTH} letters, with spaces, apostrophes or hyphens. No contact details or links.` };
  const terms = readOwnerWhimsyTerms();
  if ([...WHIMSICAL_CLIENT_WORDS, ...terms].some(existing => sameWord(existing, word))) return { saved: false, error: "That word is already included." };
  if (terms.length >= MAX_CUSTOM_WHIMSY_TERMS) return { saved: false, error: `Keep up to ${MAX_CUSTOM_WHIMSY_TERMS} custom words. Remove one before adding another.` };
  return { saved: await saveTerms([...terms, word]) };
}
export async function removeOwnerWhimsyTerm(input: string): Promise<WhimsyTermResult> {
  if (WHIMSICAL_CLIENT_WORDS.some(word => sameWord(word, input))) return { saved: false, error: "The six original words are permanent." };
  return { saved: await saveTerms(readOwnerWhimsyTerms().filter(word => !sameWord(word, input))) };
}
function subscribe(callback: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) volatileChoice = null;
    if (event.key === termsKey || event.key === null) volatileTerms = null;
    if (event.key === key || event.key === termsKey || event.key === null) callback();
  };
  window.addEventListener(changed, callback); window.addEventListener("storage", storage);
  return () => { window.removeEventListener(changed, callback); window.removeEventListener("storage", storage); };
}
export function useOwnerWhimsy() { const account = useStudioSettings(); const local = useSyncExternalStore(subscribe, readLocalOwnerWhimsy, () => true); return account.settings?.whimsyEnabled ?? local; }
export function useOwnerWhimsyTerms(): string[] {
  const account = useStudioSettings();
  const snapshot = useSyncExternalStore(subscribe, readTermsSnapshot, () => "[]");
  const local = useMemo(() => JSON.parse(snapshot), [snapshot]);
  return account.settings?.whimsyTerms ?? local;
}
export function chooseWhimsicalClientWord(random = Math.random): string {
  const words = [...WHIMSICAL_CLIENT_WORDS, ...readOwnerWhimsyTerms()], value = random();
  return words[Number.isFinite(value) ? Math.max(0, Math.min(words.length - 1, Math.floor(value * words.length))) : 0];
}
export function useAddClientLabel(): string {
  const enabled = useOwnerWhimsy(), terms = useOwnerWhimsyTerms(), [word, setWord] = useState("Floof"), chosen = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || chosen.current && [...WHIMSICAL_CLIENT_WORDS, ...terms].includes(chosen.current)) return;
    let active = true;
    // Stable while aiming at the button; replace a chosen custom word only if removed.
    queueMicrotask(() => { if (active) { const next = chooseWhimsicalClientWord(); chosen.current = next; setWord(next); } });
    return () => { active = false; };
  }, [enabled, terms]);
  return enabled ? `Add ${word}` : "Add Client";
}
const SPACE_NAMES=['Taylor’s Space','Spade’s Space','Spoodle’s Space','Tay’s Space'] as const;
const SITE_IDENTITIES=['a Red Folf','the Red Folf','Spartan','a Furry','a Fursuit Maker','a Puppy'] as const;
export function chooseOwnerWhimsyIdentity(random=Math.random){const pick=<T,>(values:readonly T[])=>{const draw=random();return values[Number.isFinite(draw)?Math.max(0,Math.min(values.length-1,Math.floor(draw*values.length))):0];};return{space:pick(SPACE_NAMES),identity:pick(SITE_IDENTITIES)};}
/** One draw per workspace visit, stable while editing; the existing whimsy switch owns it. */
export function useOwnerWhimsyIdentity(){const enabled=useOwnerWhimsy(),[choice,setChoice]=useState<{space:string;identity:string}>({space:'Taylor’s Space',identity:'a Red Folf'}),chosen=useRef(false);useEffect(()=>{let active=true;if(enabled&&!chosen.current)void Promise.resolve().then(()=>{if(active){chosen.current=true;setChoice(chooseOwnerWhimsyIdentity());}});return()=>{active=false;};},[enabled]);return enabled?choice:{space:'Taylor’s Space',identity:'a Red Folf'};}
