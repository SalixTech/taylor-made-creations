import terms from "../data/terms-of-service.json";
import type { PublicSiteState } from "../server/published-site";

const originalTerms = {
  title: "Terms of service",
  blocks: [
    ...terms.sections.map(section => ({ id: `terms-${section.id}`, type: "text", heading: section.heading, body: section.items.join("\n\n") })),
    { id: "terms-agreement", type: "text", heading: "", body: terms.agreement },
  ],
};
/** Consent is tied to the displayed terms, not unrelated gallery, price, or navigation updates. */
export function currentTermsIdentity(state: PublicSiteState): string | null {
  if (state.status === "baseline") return JSON.stringify(originalTerms);
  if (state.status !== "published") return null;
  const page = state.snapshot.content.pages.find(page => page.builtinKey === "terms");
  if (!page?.blocks.length) return null;
  return JSON.stringify({ title: page.title, blocks: page.blocks });
}
/** Keep unanswered and explicit No choices intact. A stale Yes becomes unanswered, never implicitly No. */
export function withCurrentTermsConsent<T extends { tos: string; tosAgreed: boolean }>(draft: T, acceptedIdentity: string | null, currentIdentity: string | null): T {
  if (currentIdentity !== null && acceptedIdentity === currentIdentity) return draft;
  return { ...draft, tos: draft.tos === "Yes" ? "" : draft.tos, tosAgreed: false };
}

/** Private form rehearsal uses only the terms shown from the authenticated draft. */
export function previewTermsIdentity(content: import("../owner/model").OwnerContent): string | null {
  const page = content.pages.find(page => page.builtinKey === "terms" && !page.trashedAt && page.availability !== "hidden");
  return page?.blocks.length ? JSON.stringify({ title: page.title, blocks: page.blocks }) : null;
}
