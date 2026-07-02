import ForgeWorkspaceApp from "../../../../src/components/ForgeWorkspaceApp";
import { getCurrentStep, resolveWorkspaceRoute, resolveWorkspaceSurface } from "../../../../src/workflow/v0-workflow";

interface WorkspaceRoutePageProps {
  params: Promise<{ workspaceSlug: string; segments: string[] }>;
}

export default async function WorkspaceRoutePage({ params }: WorkspaceRoutePageProps) {
  const { workspaceSlug, segments } = await params;
  const activeSurface = resolveWorkspaceSurface(segments);
  const activeStep = resolveWorkspaceRoute(segments);

  return (
    <ForgeWorkspaceApp
      workspaceSlug={workspaceSlug}
      activeStep={activeSurface ? getCurrentStep() : activeStep}
      activeSurface={activeSurface}
    />
  );
}
