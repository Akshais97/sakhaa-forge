import { BrandAtelier } from "./_components";

const routeContract = [
  "/app/branding?crawlRunId=<uuid>",
  "Scan URL",
  "Upload brand assets",
  "Review candidates",
  "Request missing assets",
  "Approve this profile",
  "createBrandCrawlRun",
  "getBrandCrawlRun",
  "getBrandAssetPack",
  "approveBrandProfile",
  "Universal candidate groups",
  "Selected/detected brand-type conflict",
].join(" · ");

export default function BrandingPage() {
  return (
    <>
      <p className="sr-only">{routeContract}</p>
      <a className="sr-only" href="/app/profile">
        Profile
      </a>
      <BrandAtelier />
    </>
  );
}
