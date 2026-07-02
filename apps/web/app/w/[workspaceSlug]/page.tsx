import ForgeWorkspaceApp from "../../../src/components/ForgeWorkspaceApp";
import { getCurrentStep } from "../../../src/workflow/v0-workflow";

interface WorkspaceHomePageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function WorkspaceHomePage({ params }: WorkspaceHomePageProps) {
  const { workspaceSlug } = await params;

  return <ForgeWorkspaceApp workspaceSlug={workspaceSlug} activeStep={getCurrentStep()} />;
}
