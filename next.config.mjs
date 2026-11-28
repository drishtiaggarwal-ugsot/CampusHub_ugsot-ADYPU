/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: [
    'localhost',
    'localhost:3000',
    '127.0.0.1',
    '127.0.0.1:3000',
    '10.102.9.148',
    '10.102.9.148:3000',
    '*.local',
    'gppongmhjkpfnbhagpmjfkannfbllamg',
  ],
  async redirects() {
    return [
      {
        source: '/forum/:path*',
        destination: '/community',
        permanent: true,
      },
      {
        source: '/forum',
        destination: '/community',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
