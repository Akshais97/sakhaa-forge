const sections = [
  {
    id: "truth",
    roman: "II.",
    label: "Brand truth",
    title: "Approved brand material becomes the source of truth.",
    body: "Brand intake keeps URL scope, uploads, rights acknowledgement, extracted candidates, confidence and source evidence separate until a human approves one exact profile version.",
    image: "Image 02",
    caption: "Brand truth evidence",
  },
  {
    id: "discovery",
    roman: "III.",
    label: "Viral discovery",
    title: "Observed real-estate patterns are selected with source and rights context.",
    body: "The discovery path preserves candidate identity, metric snapshot time, platform context, media preview and rights warnings before a candidate can become blueprint input.",
    image: "Image 03",
    caption: "Viral candidate card",
  },
  {
    id: "blueprint",
    roman: "IV.",
    label: "Blueprint to video",
    title: "A selected candidate turns into scenes, formula and director prompt.",
    body: "Thumbnail, OCR, transcript, keyframes, scene timing and replacement guidance are retained as stage evidence, then merged into an immutable blueprint.",
    image: "Image 04",
    caption: "Blueprint timeline",
  },
];

const workflow = [
  "Brand intake",
  "Approved brand truth",
  "Viral discovery",
  "Blueprint to video",
  "Script tournament",
  "Reserve credits and generate",
  "Human review",
  "Verified publication",
  "Published and verified",
];

const evidenceCards = [
  ["Brand profile", "Approved v3", "Human-approved source of truth"],
  ["Provider state", "Unknown - checking", "Reconcile before retry"],
  ["Credits reserved", "₹480 maximum", "Held until outcome settles"],
  ["Audience verification", "Required", "Account, media and visibility checked"],
];

export default function Home() {
  return (
    <main id="top" className="landing">
      <aside className="side-rail left" aria-hidden="true">
        <span className="rail-text">Sakhaa Forge</span>
      </aside>
      <aside className="side-rail right" aria-hidden="true">
        <span className="rail-text">Evidence before claims</span>
      </aside>

      <div className="topbar">
        <div className="container topbar-inner">
          <span>
            <b>Sakhaa Forge</b> / Product V0
          </span>
          <span className="mid">India-first real-estate production</span>
          <span>Unknown stays unknown until checked</span>
        </div>
      </div>

      <header className="nav">
        <div className="container nav-inner">
          <a className="brand" href="#top" aria-label="Sakhaa Forge home">
            <span className="brand-mark">SF</span>
            <span>
              Sakhaa Forge
              <small>Virality creator engine</small>
            </span>
          </a>
          <nav className="nav-links" aria-label="Page sections">
            <a href="#truth">Truth</a>
            <a href="#workflow">Workflow</a>
            <a href="#app">App</a>
            <a href="#access" className="nav-cta">
              Request access
            </a>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="label">Real-estate production workflow</span>
            <h1 className="display">
              Create property videos from <em>approved truth</em> to verified publication<span>.</span>
            </h1>
            <p className="lead">
              Sakhaa Forge helps teams move through brand intake, viral discovery, blueprinting,
              scripts, credit reservation, generation, review, publishing and audience
              verification with retained lineage and cost evidence.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="#app">
                View app surface
              </a>
              <a className="btn btn-ghost" href="#workflow">
                See the workflow
              </a>
            </div>
            <p className="claim-note">
              Built using structural patterns observed in high-performing short-form content.
              Performance outcomes are not guaranteed.
            </p>
          </div>

          <div className="hero-art" aria-label="Numbered hero image placeholder">
            <div className="image-slot image-slot-hero">
              <span>Image 01</span>
              <b>Hero product scene</b>
              <p>9:16 property video, evidence rail and command centre preview.</p>
            </div>
            <div className="index">
              <span className="on">
                <b>01</b> Brand truth
              </span>
              <span>
                <b>02</b> Blueprint
              </span>
              <span>
                <b>03</b> Verify
              </span>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="wire">
        <div className="container wire-inner">
          <div className="wire-left">
            <span className="wire-pulse" aria-hidden="true" />
            <span>
              V0 route
              <b>Brand to publication</b>
            </span>
          </div>
          <div className="wire-track" aria-label="Sakhaa Forge workflow">
            {workflow.map((item, index) => (
              <span key={item}>
                {String(index + 1).padStart(2, "0")} / {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {sections.map((section, index) => (
        <section className="feature-section" id={section.id} key={section.id}>
          <div className="container">
            <div className="sec-rule">
              <span className="roman">{section.roman}</span>
              <span>{section.label}</span>
              <span>{String(index + 2).padStart(3, "0")} / 008</span>
            </div>
            <div className="feature-grid">
              <div>
                <span className="label">{section.label}</span>
                <h2 className="display">{section.title}</h2>
                <p className="lead">{section.body}</p>
              </div>
              <div className="image-slot">
                <span>{section.image}</span>
                <b>{section.caption}</b>
                <p>Use owned Sakhaa creative only. No Open Design image reuse.</p>
              </div>
            </div>
          </div>
        </section>
      ))}

      <section className="method" id="app">
        <div className="container">
          <div className="sec-rule">
            <span className="roman">V.</span>
            <span>Workspace command centre</span>
            <span>005 / 008</span>
          </div>
          <div className="method-head">
            <div>
              <span className="label">App surface</span>
              <h2 className="display">The web app shows exact state before action.</h2>
            </div>
            <p>
              Public copy stays calm. Authenticated screens expose empty, loading, blocked,
              failed, retry, unknown, ready and verified states.
            </p>
          </div>

          <div className="app-preview">
            <aside>
              <b>Sakhaa Forge</b>
              {["Home", "Brands", "Blueprints", "Scripts", "Generate", "Review", "Calendar", "Activity"].map(
                (item) => (
                  <span key={item}>{item}</span>
                ),
              )}
            </aside>
            <div className="app-panel">
              <div className="app-topline">
                <span>Aster Heights launch</span>
                <b>Unknown - checking</b>
              </div>
              <div className="app-grid">
                <div className="image-slot product-shot">
                  <span>Image 05</span>
                  <b>Script tournament</b>
                  <p>Evaluated variants and exact selected script.</p>
                </div>
                <div className="state-stack">
                  {evidenceCards.map(([title, value, body]) => (
                    <article key={title}>
                      <span>{title}</span>
                      <b>{value}</b>
                      <p>{body}</p>
                    </article>
                  ))}
                </div>
                <div className="image-slot">
                  <span>Image 06</span>
                  <b>Cost and provider state</b>
                  <p>Estimate, maximum authorisation, reservation and provider reconciliation.</p>
                </div>
                <div className="image-slot">
                  <span>Image 07</span>
                  <b>Review and verification</b>
                  <p>Exact final video, approval decision and audience verification checklist.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="archive-section">
        <div className="container archive-grid">
          <div>
            <span className="label">Lineage and ledger</span>
            <h2 className="display">Every retained object can explain where it came from.</h2>
            <p className="lead">
              Brand profile, blueprint, formula, selected script, avatar, provider operation,
              final video, review decision, publication, verification, performance observation
              and credit ledger stay connected.
            </p>
          </div>
          <div className="image-slot">
            <span>Image 08</span>
            <b>Lineage archive</b>
            <p>Immutable ancestry with hashes, costs, approvals and publication evidence.</p>
          </div>
        </div>
      </section>

      <section id="access" className="cta">
        <div className="container cta-grid">
          <div>
            <span className="label">Launch confidence</span>
            <h2 className="display">Start with approved truth. Publish only with proof.</h2>
            <p className="lead">
              V0 is a system of record for expensive creative work, not a promise of reach.
            </p>
          </div>
          <a className="btn btn-primary" href="/sign-in">
            Request access
          </a>
        </div>
      </section>
    </main>
  );
}
