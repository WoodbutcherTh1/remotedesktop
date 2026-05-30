/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  generateBuildId: async () => {
    return `rd-${Date.now()}`;
  },
};

module.exports = nextConfig;
