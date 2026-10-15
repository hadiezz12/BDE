import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Brand images are local (public/brand). Profile pictures come from a
    // private Supabase bucket through short-lived signed URLs and are shown
    // unoptimized, so no remote host is listed. No stock photography.
    formats: ["image/webp"],
  },
  experimental: {
    serverActions: {
      // Profile pictures: the avatars bucket accepts up to 2 MB; the extra
      // room covers the multipart encoding. Everything else stays small.
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
