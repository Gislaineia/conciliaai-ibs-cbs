/** @type {import('next').NextConfig} */
const nextConfig = {
      reactStrictMode: true,
      experimental: {
              serverActions: { allowedOrigins: ["*"] },
              serverComponentsExternalPackages: ["node-forge", "fast-xml-parser", "xml-crypto"],
      },
      webpack: (config, { isServer }) => {
              if (!isServer) {
                        config.resolve.fallback = {
                                    ...config.resolve.fallback,
                                    "node-forge": false,
                                    "fast-xml-parser": false,
                                    "xml-crypto": false,
                                    zlib: false,
                                    https: false,
                                    http: false,
                                    net: false,
                                    tls: false,
                                    fs: false,
                                    path: false,
                                    crypto: false,
                        };
              }
              return config;
      },
};
module.exports = nextConfig;
