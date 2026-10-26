import careInstructions from "@/data/care-instructions.json";

// Full text transcribed from Taylor's supplied TMC Care Instructions PDF.
// Product destinations are preserved without adding affiliate tracking.
export function SuitCare() {
  return (
    <div className="page-shell narrow care-page" style={{ color: "#111", background: "#fff", fontFamily: 'Arial, "Segoe UI", sans-serif', fontWeight: 400 }}>
      <header className="page-intro">
        <p className="eyebrow">TAYLOR MADE CREATIONS</p>
        <h1 style={{ color: "#111", fontFamily: "inherit", fontWeight: 700 }}>Fursuit care</h1>
        <div className="actions" style={{ justifyContent: "flex-start", marginTop: 24 }}>
          <a className="button" href="/downloads/taylor-made-creations-care.pdf" download>
            Download care instructions (PDF) <span aria-hidden="true">↓</span>
          </a>
        </div>
      </header>

      <section aria-labelledby="recommended-care-items" style={{ paddingBottom: 32, marginBottom: 40, borderBottom: "2px solid var(--accent, #a61921)" }}>
        <h2 id="recommended-care-items" style={{ color: "#111", fontFamily: "inherit", fontWeight: 700 }}>Recommended Items</h2>
        <p style={{ lineHeight: 1.75 }}>All items here are items that I not only recommend but also use personally to take care of my own fursuits.</p>
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexWrap: "wrap", gap: "12px 24px", marginTop: 20 }}>
          {careInstructions.recommendedItems.map(({ name, href }) => (
            <li key={name}>
              <a className="text-link" href={href}>{name} <span aria-hidden="true">↗</span></a>
            </li>
          ))}
        </ul>
      </section>

      <div>
        {careInstructions.sections.map(({ heading, paragraphs }) => (
          <section key={heading} aria-labelledby={`care-${heading.toLowerCase().replaceAll(" ", "-")}`} style={{ marginBottom: 44 }}>
            <h2 id={`care-${heading.toLowerCase().replaceAll(" ", "-")}`} style={{ color: "#111", fontFamily: "inherit", fontWeight: 700, marginBottom: 20 }}>{heading}</h2>
            {paragraphs.map((paragraph) => (
              <p key={paragraph} style={{ fontSize: "1rem", lineHeight: 1.8, marginBottom: 18 }}>{paragraph}</p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
