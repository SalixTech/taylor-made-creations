import terms from "@/data/terms-of-service.json";
import styles from "./Terms.module.css";

// Taylor's supplied TMC TOS PDF, with the unfinished final bullet omitted.
export function Terms() {
  return (
    <div className={`page-shell narrow ${styles.terms}`}>
      <header className="page-intro">
        <p className="eyebrow">THE IMPORTANT DETAILS</p>
        <h1>Terms of service</h1>
      </header>
      {terms.sections.map(({ id, heading, items }) => (
        <section key={id} aria-labelledby={`terms-${id}`} className={styles.section}>
          <h2 id={`terms-${id}`}>{heading}</h2>
          <ul>
            {items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ))}
      <p className={styles.agreement}>{terms.agreement}</p>
    </div>
  );
}
