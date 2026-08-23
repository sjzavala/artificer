/** @type {import('next').NextConfig} */
const nextConfig = {
  // Left to Node's own resolver rather than the server bundler: pdfjs ships a
  // large worker-aware build and jsforce is CommonJS that loads at runtime.
  serverExternalPackages: ['pdfjs-dist', 'jsforce'],

  webpack: (config, { isServer }) => {
    if (isServer) {
      // `serverExternalPackages` matches package names, and the parser imports
      // a deep subpath (`pdfjs-dist/legacy/build/pdf.mjs`), which slipped
      // through and got bundled. Bundling pulls in pdf.js's canvas rendering
      // path, which needs a DOMMatrix that does not exist in Node — so the
      // deployed function failed on every upload while local parsing was fine.
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
        ({ request }, callback) =>
          request?.startsWith('pdfjs-dist')
            ? callback(null, `module ${request}`)
            : callback(),
      ];
    }
    return config;
  },

  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
