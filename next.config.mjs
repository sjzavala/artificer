/** @type {import('next').NextConfig} */
const nextConfig = {
  // Left to Node's own resolver rather than the server bundler: pdfjs ships a
  // large worker-aware build and jsforce is CommonJS that loads at runtime.
  serverExternalPackages: ['pdfjs-dist', 'jsforce'],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
