import type { Metadata } from "next";
import BrandExtractApp from "./_components/BrandExtractApp";

export const metadata: Metadata = {
  title: "Brand extract · Sakhaa Forge",
  description:
    "Brand extraction intake for permitted URLs, approved assets and evidence-backed candidate review.",
};

const routeContract = [
  "/brand-extract",
  "createBrandCrawlRun",
  "getBrandCrawlRun",
  "getBrandAssetPack",
  "approveBrandProfile",
  "Firecrawl",
  "BrandExtractionStudio",
  "Universal candidate groups",
  "Selected/detected brand-type conflict",
].join(" · ");

export default function BrandExtractPage() {
  return (
    <div className="h-dvh overflow-y-auto bg-[#050507]">
      <p className="sr-only">{routeContract}</p>
      <BrandExtractApp />
    </div>
  );
}
