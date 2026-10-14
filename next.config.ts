import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Mock photography is hotlinked from Unsplash (free licence, credited in
    // src/data/mock/photos.ts). Supabase Storage gets added here in Phase 2.
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com", pathname: "/photo-**" }],
    formats: ["image/webp"],
  },
};

export default nextConfig;
