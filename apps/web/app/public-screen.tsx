type PublicScreenProps = {
  eyebrow: string;
  title: string;
  body: string;
  primaryLabel: string;
  secondary?: string;
};

export function PublicScreen({ eyebrow, title, body, primaryLabel, secondary }: PublicScreenProps) {
  return (
    <main className="public-screen">
      <section className="public-panel" aria-labelledby="public-title">
        <a className="brand public-brand" href="/">
          <span className="brand-mark">SF</span>
          <span>Sakhaa Forge</span>
        </a>
        <p className="eyebrow quiet">{eyebrow}</p>
        <h1 id="public-title">{title}</h1>
        <p>{body}</p>
        <div className="actions">
          <a className="button primary" href="/">
            {primaryLabel}
          </a>
          {secondary ? <span className="support-note">{secondary}</span> : null}
        </div>
      </section>
    </main>
  );
}
