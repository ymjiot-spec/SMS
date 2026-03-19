/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@zendesk-sms-tool/shared'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Zendeskのiframe内に埋め込めるよう X-Frame-Options を無効化
          {
            key: 'X-Frame-Options',
            value: 'ALLOWALL',
          },
          // Content-Security-Policy で frame-ancestors を許可
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://*.zendesk.com https://*.zdassets.com http://localhost:*",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
