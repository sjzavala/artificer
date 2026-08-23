/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse and jsforce are CommonJS packages that must not be bundled by
  // the server compiler — they load files/natives at runtime.
  serverExternalPackages: ['pdf-parse', 'jsforce'],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
