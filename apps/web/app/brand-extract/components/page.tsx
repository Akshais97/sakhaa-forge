import type { Metadata } from "next";
import { BrandAssetsComponentPreview } from "../_components/brand-assets";

export const metadata: Metadata = {
  title: "Component review · Sakhaa Forge",
  description: "Reusable brand intake and acquired asset library components.",
};

export default function BrandAssetsComponentsPage() {
  return <BrandAssetsComponentPreview />;
}
