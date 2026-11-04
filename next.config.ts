import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No "X-Powered-By: Next.js": nothing to gain from announcing the framework (Phase 15).
  poweredByHeader: false,
  images: {
    // Brand images are local (public/brand). Association images and public
    // team photos are served by the site's own routes (src/app/media/), which
    // check with the visitor's rights; draft images (/media/apercu/) are never
    // optimized (src/lib/media-url.ts). No remote host, no stock photography.
    formats: ["image/webp"],
    // A published image that stops being public (page unpublished, withheld,
    // replaced) must disappear quickly from the optimizer's cache too.
    minimumCacheTTL: 300,
  },
  async headers() {
    return [
      {
        // No other site may frame these pages (clickjacking on publish,
        // invite, delete buttons). The page preview frames the site itself
        // (/associations/<slug>/apercu?vue=telephone), hence SAMEORIGIN.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Phase 14: no plugin content, no <base> rewriting, forms post to this site only.
          // Phase 15: pages get the full policy with a script nonce from the proxy (src/lib/security/csp.ts),
          // which replaces this one; this stays for the responses the proxy does not see.
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // No page needs a camera, a microphone, the location or payment.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // Ignored over plain HTTP (local development); on the real domain, HTTPS only for a year.
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // Profile pictures: the avatars bucket accepts up to 2 MB; the extra
      // room covers the multipart encoding. Association images go through a
      // route handler instead (upload progress), see below.
      bodySizeLimit: "3mb",
    },
    // Association image uploads (src/app/manage/[asso]/media/upload) accept up
    // to 12 MB before the server re-encodes them; the proxy buffers request
    // bodies, so its limit must leave room for that plus the multipart envelope.
    proxyClientMaxBodySize: "13mb",
  },
};

export default nextConfig;
