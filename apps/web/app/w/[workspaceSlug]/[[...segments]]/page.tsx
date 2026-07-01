import { primaryNav, resolveScreen, screenSpecs } from "../../../workspace-screen-model";

type WorkspaceRouteProps = {
  params: Promise<{
    workspaceSlug: string;
    segments?: string[];
  }>;
};

export default async function WorkspaceRoute({ params }: WorkspaceRouteProps) {
  const { workspaceSlug, segments = [] } = await params;
  const screen = resolveScreen(segments);
  const base = `/w/${workspaceSlug}`;
  const current = segments[0] ?? "";

  return (
    <main className="workspace-app">
      <a className="skip-link" href="#workspace-content">
        Skip to content
      </a>
      <aside className="workspace-rail" aria-label="Workspace navigation">
        <a className="brand" href="/">
          <span className="brand-mark">SF</span>
          <span>Sakhaa Forge</span>
        </a>
        <nav>
          {primaryNav.map(([label, href]) => {
            const active = href === "" ? current === "" : current === href.split("/")[0];
            return (
              <a key={href || "home"} href={href ? `${base}/${href}` : base} aria-current={active ? "page" : undefined}>
                {label}
              </a>
            );
          })}
        </nav>
        <div className="rail-wallet">
          <span>Creator credits</span>
          <b>Reserved: ₹480</b>
          <small>Maximum authorisation visible before paid work.</small>
        </div>
      </aside>

      <section className="workspace-content" id="workspace-content">
        <header className="workspace-topbar">
          <div>
            <small>Workspace</small>
            <b>{formatWorkspace(workspaceSlug)}</b>
          </div>
          <div className="topbar-actions">
            <a href={`${base}/activity`}>Activity</a>
            <a href={`${base}/notifications`}>Notifications</a>
            <span className="status-chip">{screen.status}</span>
          </div>
        </header>

        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <a href={base}>Workspace</a>
          <span>{screen.title}</span>
        </nav>

        <section className="screen-hero" aria-labelledby="screen-title">
          <div>
            <p className="eyebrow quiet">{screen.routePattern || "/w/{workspaceSlug}"}</p>
            <h1 id="screen-title">{screen.title}</h1>
            <p>{screen.purpose}</p>
          </div>
          <div className="screen-action-card">
            <span>Primary action</span>
            <b>{screen.primaryAction}</b>
            <small>{screen.permission}</small>
          </div>
        </section>

        <section className="workspace-grid" aria-label="Screen details">
          <article className="studio-panel">
            <div className="panel-title">
              <span>State contract</span>
              <b>{screen.status}</b>
            </div>
            <div className="state-stack">
              {screen.states.map((state) => (
                <span key={state}>{state}</span>
              ))}
            </div>
          </article>

          <article className="studio-panel">
            <div className="panel-title">
              <span>Data shown</span>
              <b>Server truth only</b>
            </div>
            <ul className="clean-list">
              {screen.dataShown.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="studio-panel media-command">
            <div className="panel-title">
              <span>Production preview</span>
              <b>9:16 media first</b>
            </div>
            <div className="mini-player app-player" aria-label="Exact 9:16 media preview">
              <div className="mini-building" />
            </div>
            <p className="hash">sha256: exact version shown only after server data loads</p>
          </article>

          <article className="studio-panel">
            <div className="panel-title">
              <span>Required components</span>
              <b>Reusable system</b>
            </div>
            <ul className="clean-list">
              {screen.components.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="studio-panel">
            <div className="panel-title">
              <span>Secondary actions</span>
              <b>No irreversible optimism</b>
            </div>
            <ul className="clean-list">
              {screen.secondaryActions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="studio-panel">
            <div className="panel-title">
              <span>Evidence and recovery</span>
              <b>Lineage retained</b>
            </div>
            <p>
              Unknown provider and publication states stay visible until reconciliation. Audience
              verification is required before a post is treated as complete.
            </p>
            {screen.nextAction ? <p>{screen.nextAction}</p> : null}
          </article>
        </section>

        <section className="route-catalog" aria-label="Confirmed route catalogue">
          <div className="section-head">
            <p className="eyebrow quiet">Confirmed V0 routes</p>
            <h2>Screen catalogue follows the canonical information architecture.</h2>
          </div>
          <div className="route-grid">
            {screenSpecs.slice(0, 18).map((item) => (
              <a key={`${item.title}-${item.routePattern}`} href={item.routePattern === "*" ? base : `${base}/${samplePath(item.routePattern)}`}>
                <span>{item.title}</span>
                <b>{item.status}</b>
                <small>{item.routePattern || "/w/{workspaceSlug}"}</small>
              </a>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function samplePath(pattern: string) {
  return pattern
    .replace("{brandId}", "brand_001")
    .replace("{profileId}", "profile_v3")
    .replace("{candidateId}", "candidate_001")
    .replace("{blueprintId}", "bp_001")
    .replace("{tournamentId}", "st_001")
    .replace("{generationId}", "gen_001")
    .replace("{reviewItemId}", "rv_001")
    .replace("{calendarPostId}", "post_001")
    .replace("{finalVideoId}", "fv_001");
}

function formatWorkspace(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
