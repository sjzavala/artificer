/** @type {import('next').NextConfig} */
const nextConfig = {
  // Left to Node's own resolver rather than the server bundler: pdfjs ships a
  // large worker-aware build and jsforce is CommonJS that loads at runtime.
  serverExternalPackages: ['pdfjs-dist', 'jsforce'],

  // The guide moved to the root and the deal list moved off it. Both paths were
  // linked from the README and from anything anyone bookmarked, so they keep
  // working rather than 404ing at whoever followed an old link.
  async redirects() {
    return [{ source: '/how-it-works', destination: '/', permanent: false }];
  },

  // pdf.js loads its worker with a runtime dynamic import, which the build's
  // static file tracing cannot see. Without this the deployed function throws
  // "Setting up fake worker failed" on every upload, because the worker module
  // was never copied into the bundle.
  outputFileTracingIncludes: {
    '/api/extract': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
  },

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
