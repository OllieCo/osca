/** @type {import('next').NextConfig} */
const nextConfig = {
  // Admin Console is an internal tool — no public robots indexing
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ]
  },
}

module.exports = nextConfig
