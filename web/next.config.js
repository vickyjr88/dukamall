/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Loosest possible setting for now -- every shop's media is served from
    // the same platform API origin, so there is one host to trust, but the
    // exact origin varies per environment (local/staging/prod). Tighten to
    // an explicit domains list once the platform's production API domain is
    // fixed.
    unoptimized: true,
  },
  // Browsers ask for /favicon.ico by habit, whatever the page's <link rel="icon"> says.
  async rewrites() {
    return [{ source: '/favicon.ico', destination: '/icon' }];
  },
};

module.exports = nextConfig;
