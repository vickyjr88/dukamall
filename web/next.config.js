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
};

module.exports = nextConfig;
