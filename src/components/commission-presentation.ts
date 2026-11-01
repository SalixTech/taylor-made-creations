/** Finite UI wording only. Default model contracts and submitted answers stay unchanged. */
export const COMMISSION_COPY = {
  "Required": "Complete “{label}”.",
  "InvalidOption": "Choose a valid option for “{label}”.",
  "RequiredPart": "Complete “{label}” for {part}.",
  "InvalidPartOption": "Choose a valid option for “{label}” for {part}.",
  "EmailInvalid": "Enter a valid email address.",
  "TermsRequired": "Read and agree to the terms of service to continue.",
  "TermsConfirm": "Read and agree to the terms of service to confirm Yes.",
  "CountryInvalid": "Choose a valid shipping country.",
  "QuantityInvalid": "Choose a whole-number quantity of at least 1 for each additional part.",
  "ReferenceRequired": "Add a two-view reference sheet (one image can contain both views).",
  "ReferenceCount": "Choose no more than 5 images.",
  "ReferenceType": "Use JPG, PNG, WebP, GIF or AVIF images only (no SVG).",
  "ReferenceSize": "Each image must be 30 MB or smaller.",
  "ReferenceEmpty": "Empty image files cannot be used.",
  "FileProblem": "“{name}”: {problem}",
  "FileSignature": "“{name}” does not contain a supported image format. Choose genuine JPG, PNG, WebP, GIF or AVIF files.",
  "FileDuplicate": "“{name}” is a duplicate and was not added. Each image can only be added once.",
  "FileExcess": "“{name}” was not added. Choose no more than 5 images.",
  "FileCheck": "“{name}” could not be checked. Please choose it again.",
  "Agreed": "Agreed",
  "NotAgreed": "Not agreed",
  "NoneSelected": "None selected",
  "Requested": "Requested",
  "NotRequested": "Not requested",
  "PartQuantity": "{part} (quantity: {quantity})",
  "PartDetail": "{part} · {label}",
  "FileReview": "{name} ({size} MB)",
  "FileMetadata": "{name} · {size} MB",
  "OneFileSelected": "{count} file selected",
  "FilesSelected": "{count} files selected",
  "RemoveFileLabel": "Remove {name}",
  "QuantityForLabel": "Quantity for {part}",
  "TermsBeforeSend": "Read and agree to the current terms before sending.",
  "SendFailure": "The request could not be confirmed. Retry here to safely resume it.",
  "ConnectionSetup": "Online requests need connection setup. Please contact Taylor directly; nothing has been sent.",
  "ConnectionChanged": "The request connection changed. Reload this page before sending; nothing has been sent.",
  "InvalidResponse": "The request was not confirmed. Your details are still here. Retry to safely resume the same request.",
  "TooManyRequests": "Too many requests. Please wait before trying again. Your details are still here.",
  "ServiceSetup": "The online request service is not set up yet. Your details are still here. Please contact Taylor so the connection can be checked.",
  "AccessCheck": "The online request service needs an access check. Your request was not confirmed and your details are still here. Please contact Taylor.",
  "NetworkFailure": "Online requests could not be reached or confirmed. Your details are still here. Retry to safely resume the same request.",
  "ImagePreparation": "Image preparation is not available in this browser.",
  "ImageDetailed": "A reference is too detailed to upload safely. Please choose a smaller copy."
} as const;
export type CommissionCopyKey=keyof typeof COMMISSION_COPY;
export type CommissionCopyFormatter=(key:CommissionCopyKey,variables?:Record<string,string>)=>string;
export const defaultCommissionCopy:CommissionCopyFormatter=(key,variables={})=>COMMISSION_COPY[key].replace(/\{([^}]+)\}/g,(token,name)=>variables[name]??token);
const localErrorKeys:CommissionCopyKey[]=["TermsBeforeSend", "SendFailure", "ConnectionSetup", "ConnectionChanged", "InvalidResponse", "TooManyRequests", "ServiceSetup", "AccessCheck", "NetworkFailure", "ImagePreparation", "ImageDetailed"];
/** Only exact known local errors are customized; unknown backend diagnostics remain plain text. */
export function commissionErrorCopy(message:string,display:CommissionCopyFormatter):string{const key=localErrorKeys.find(key=>COMMISSION_COPY[key]===message);return key?display(key):message;}

/** Empty presentation overrides must never remove a validation failure. */
export function nonemptyCommissionCopy(display:CommissionCopyFormatter):CommissionCopyFormatter{return (key,variables)=>{const value=display(key,variables);return value.trim()?value:defaultCommissionCopy(key,variables);};}
