import { isSafeLink } from "./model";

export type InlineTextPart = { text: string; href?: string };
/** A deliberately small link-only syntax. HTML, images, scripts and embeds stay text. */
export function parseInlineLinks(text: string): InlineTextPart[] {
  const result: InlineTextPart[] = [];
  const pattern = /\[([^\]\r\n]{1,300})\]\(([^\s)]{1,2048})\)/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index!;
    if (!isSafeLink(match[2])) continue;
    if (start > cursor) result.push({ text: text.slice(cursor, start) });
    result.push({ text: match[1], href: match[2] });
    cursor = start + match[0].length;
  }
  if (cursor < text.length || !result.length) result.push({ text: text.slice(cursor) });
  return result;
}
export function makeInlineLink(label: string, href: string): string | null {
  const name = label.trim(), destination = href.trim();
  if (!name || name.length > 300 || /[\[\]\r\n]/.test(name) || !isSafeLink(destination)) return null;
  return `[${name}](${destination.replaceAll("(", "%28").replaceAll(")", "%29")})`;
}
/** Avoid offering a nested link inside an existing link's text. */
export function templateSupportsInlineLinks(key: string): boolean {
  return !["commissions.copyRequired","commissions.copyInvalidOption","commissions.copyRequiredPart","commissions.copyInvalidPartOption","commissions.copyEmailInvalid","commissions.copyTermsRequired","commissions.copyTermsConfirm","commissions.copyCountryInvalid","commissions.copyQuantityInvalid","commissions.copyReferenceRequired","commissions.copyReferenceCount","commissions.copyReferenceType","commissions.copyReferenceSize","commissions.copyReferenceEmpty","commissions.copyFileProblem","commissions.copyFileSignature","commissions.copyFileDuplicate","commissions.copyFileExcess","commissions.copyFileCheck","commissions.copyAgreed","commissions.copyNotAgreed","commissions.copyNoneSelected","commissions.copyRequested","commissions.copyNotRequested","commissions.copyPartQuantity","commissions.copyPartDetail","commissions.copyFileReview","commissions.copyFileMetadata","commissions.copyOneFileSelected","commissions.copyFilesSelected","commissions.copyRemoveFileLabel","commissions.copyQuantityForLabel","commissions.copyTermsBeforeSend","commissions.copySendFailure","commissions.copyConnectionSetup","commissions.copyConnectionChanged","commissions.copyInvalidResponse","commissions.copyTooManyRequests","commissions.copyServiceSetup","commissions.copyAccessCheck","commissions.copyNetworkFailure","commissions.copyImagePreparation","commissions.copyImageDetailed","site.selectPlaceholder","site.selectListLabel","site.selectEmpty","site.countryListLabel","site.countryEmpty","site.countryPlaceholder","site.pdfFailureMessage","commissions.formDifferentRequestButton","commissions.formBackButton","commissions.formResetButton","commissions.formReviewButton","commissions.formTermsButton","commissions.formFilesButton","commissions.formRemoveButton","commissions.formSendingButton","commissions.formSendButton","commissions.termsCancelButton","commissions.termsAgreeButton","premades.cartExploreButton","premades.cartShippingButton","premades.cartDestinationLabel","premades.cartCountryLabel","premades.cartBackButton","premades.cartReviewButton","premades.cartBackShippingButton","premades.cartRemoveButton","commissions.formOptionPlaceholder","commissions.formSuitPlaceholder","commissions.formOptionalLabel","commissions.formQuantityLabel","premades.cartDestinationPlaceholder","premades.cartUSLabel","premades.cartInternationalLabel","premades.cartTriggerButton","premades.photoViewListing","premades.photoViewDetails","premades.photoEnlarge","premades.photoViewLarger","premades.photoNumber","premades.photoClose","premades.photoPrevious","premades.photoNext","home.pricesEyebrow", "home.pricesBody", "home.careEyebrow", "home.careBody", "prices.exampleLabel", "commissions.requestButton", "commissions.formButton", "contact.telegramLabel", "contact.discordLabel", "contact.tiktokLabel", "contact.twitchLabel", "contact.emailLabel", "site.designCredit", "site.platformCredit", "site.trelloLabel", "site.moreLabel", "premades.thirdPartyLink", "premades.viewCart", "premades.addCart", "premades.viewListing", "premades.viewPurchase", "gallery.closeLabel", "gallery.previousLabel", "gallery.nextLabel", "contact.unconnectedButton"].includes(key) && !key.endsWith("Placeholder");
}
