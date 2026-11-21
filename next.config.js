/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Mongoose must not be bundled into server chunks.
  serverExternalPackages: ['mongoose'],
  // The app doesn't use next/image. Turning optimization off keeps the
  // /_next/image endpoint (the source of several Next.js CVEs) out of play.
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};
