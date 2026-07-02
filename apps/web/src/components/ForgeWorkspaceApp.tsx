import Link from "next/link";
import type { CSSProperties } from "react";
import {
  DEFAULT_WORKFLOW_SNAPSHOT,
  WORKFLOW_STEPS,
  WORKSPACE_SURFACES,
  getStepAccess,
  getStepHref,
  type StepAccess,
  type WorkspaceSurface,
  type WorkflowStep
} from "../workflow/v0-workflow";
import { WorkflowScreenRenderer } from "../workflow/v0-screens";

interface ForgeWorkspaceAppProps {
  workspaceSlug: string;
  activeStep: WorkflowStep;
  activeSurface?: WorkspaceSurface;
}

function toneClasses(access: StepAccess) {
  if (access === "current") return "border-white/40 bg-white/[0.09] text-white";
  if (access === "read_only") return "border-emerald-300/30 bg-emerald-300/[0.08] text-emerald-100";
  if (access === "unknown") return "border-violet-300/30 bg-violet-300/[0.08] text-violet-100";
  if (access === "failed") return "border-red-300/30 bg-red-300/[0.08] text-red-100";
  if (access === "blocked") return "border-fuchsia-300/30 bg-fuchsia-300/[0.08] text-fuchsia-100";
  return "border-white/10 bg-white/[0.025] text-zinc-500";
}

function StatusChip({ access }: { access: StepAccess }) {
  const labelByAccess: Record<StepAccess, string> = {
    current: "Current",
    complete: "Complete",
    read_only: "Read-only",
    locked: "Locked",
    blocked: "Blocked",
    failed: "Failed",
    unknown: "Unknown — checking"
  };

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${toneClasses(access)}`}>
      {labelByAccess[access]}
    </span>
  );
}

function WorkflowRail({ workspaceSlug, activeStep }: { workspaceSlug: string; activeStep: WorkflowStep }) {
  return (
    <aside className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4 shadow-2xl shadow-black/30 backdrop-blur-xl lg:sticky lg:top-5 lg:max-h-[calc(100dvh-2.5rem)] lg:overflow-y-auto">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-zinc-500">V0 workflow</p>
          <h2 className="mt-1 font-display text-lg font-semibold text-white">Production journey</h2>
        </div>
        <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 font-mono text-[11px] text-zinc-300">
          {WORKFLOW_STEPS.length} steps
        </span>
      </div>

      <ol className="space-y-2">
        {WORKFLOW_STEPS.map((step, index) => {
          const access = getStepAccess(step, DEFAULT_WORKFLOW_SNAPSHOT);
          const isActive = step.key === activeStep.key;
          const href = getStepHref(workspaceSlug, step);

          return (
            <li key={step.key}>
              <Link
                href={href}
                className={`group grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-2xl border p-3 transition hover:border-white/25 hover:bg-white/[0.06] ${toneClasses(
                  isActive ? "current" : access
                )}`}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/30 font-mono text-xs text-zinc-300">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-zinc-100">{step.title}</span>
                  <span className="mt-1 block truncate font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">{step.group}</span>
                </span>
                <StatusChip access={isActive ? "current" : access} />
              </Link>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

function SupportSurfacePanel({ surface }: { surface: WorkspaceSurface }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-[#101014]/90 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">{surface.group}</p>
      <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-tight text-white md:text-5xl">{surface.title}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-300">{surface.purpose}</p>

      <div className="mt-8 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[1.5rem] border border-white/10 bg-black/30 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-500">Contract source</p>
          <p className="mt-4 text-sm leading-6 text-zinc-200">{surface.contract}</p>
        </div>
        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-500">Evidence this page protects</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {surface.evidence.map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-black/25 p-3 text-sm text-zinc-200">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function ForgeWorkspaceApp({ workspaceSlug, activeStep, activeSurface }: ForgeWorkspaceAppProps) {
  const snapshot = DEFAULT_WORKFLOW_SNAPSHOT;

  return (
    <div
      id="sakhaa-forge-workspace-app"
      className="min-h-dvh overflow-x-hidden bg-[#050507] text-zinc-100"
      style={{ "--brand-accent": "#8b7cf6" } as CSSProperties}
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(139,124,246,0.18),transparent_70%)]" />
      <div className="relative mx-auto grid min-h-dvh max-w-[1500px] gap-5 px-4 py-4 lg:grid-cols-[390px_1fr] lg:px-6">
        <WorkflowRail workspaceSlug={workspaceSlug} activeStep={activeStep} />

        <main className="min-w-0 space-y-5">
          <header className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4 backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">Workspace</p>
                <h2 className="mt-1 font-display text-xl font-semibold text-white">{snapshot.workspaceName}</h2>
              </div>
              <nav className="flex flex-wrap gap-2" aria-label="Workspace tools">
                {WORKSPACE_SURFACES.map((item) => (
                  <Link
                    key={item.key}
                    href={`/w/${workspaceSlug}${item.route}`}
                    className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-white/25 hover:text-white"
                  >
                    {item.title}
                  </Link>
                ))}
              </nav>
            </div>
          </header>

          {activeSurface ? <SupportSurfacePanel surface={activeSurface} /> : <WorkflowScreenRenderer workspaceSlug={workspaceSlug} activeStep={activeStep} />}
        </main>
      </div>
    </div>
  );
}
