/** @type {import('next').NextConfig} */
const v0ApiBaseUrl = (process.env.V0_API_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");

const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/v0/:path*",
        destination: `${v0ApiBaseUrl}/api/v0/:path*`
      }
    ];
  }
};

export default nextConfig;
