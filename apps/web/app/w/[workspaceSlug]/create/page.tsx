import { redirect } from "next/navigation";
import { getCurrentStep, getStepHref } from "../../../../src/workflow/v0-workflow";

interface CreatePageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function CreatePage({ params }: CreatePageProps) {
  const { workspaceSlug } = await params;
  redirect(getStepHref(workspaceSlug, getCurrentStep()));
}
