"use client";

/** A failed publication read is not evidence that the requested page is missing. */
export function PublicUnavailable({ message }: { message: string }) {
  return <div className="page-shell"><div className="page-intro" role="alert"><p className="eyebrow">PLEASE TRY AGAIN</p><h1>The website is temporarily unavailable.</h1><p>{message}</p><button className="button" type="button" onClick={() => window.location.reload()}>Reload website</button></div></div>;
}
