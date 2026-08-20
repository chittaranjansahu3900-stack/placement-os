import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Firebase App Hosting (Cloud Run): without this the build
  // succeeds but the container fails to start, with nothing in the logs
  // pointing back to this as the cause. See README "Hosting" section.
  output: "standalone",
};

export default nextConfig;
