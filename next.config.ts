import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Every image is local for now (public/brand). When the BDE and the
    // associations upload their own photos (Supabase Storage, Phase 2), add
    // that host here under `remotePatterns`. No stock photography.
    formats: ["image/webp"],
  },
};

export default nextConfig;
