/** Exact supplied circle-spade artwork, tinted with currentColor in every theme. */
export function SpadeMark({ className = "" }: { className?: string }) {
  return <span className={className} aria-hidden="true" style={{ display: "inline-block", width: "2rem", height: "2rem", flexShrink: 0, backgroundColor: "currentColor", maskImage: "url(/images/tmc-spade-mark.png)", WebkitMaskImage: "url(/images/tmc-spade-mark.png)", maskSize: "contain", WebkitMaskSize: "contain", maskPosition: "center", WebkitMaskPosition: "center", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat" }} />;
}
