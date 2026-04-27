/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  transpilePackages: ['react-beautiful-dnd'],
  // Standalone режим для Docker
  output: 'standalone',
  // Прокси для API запросов
  // В одном контейнере проксируем все /api/* на Backend
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
  // Отключение кэширования в dev режиме
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  webpack: (config, { isServer, dev }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    // Отключение кэширования в dev режиме
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

module.exports = nextConfig;
