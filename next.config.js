/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  transpilePackages: ['react-beautiful-dnd'],
  // Standalone режим для Docker
  output: 'standalone',
  // Прокси для API запросов (только если Backend на другом домене)
  // В одном контейнере не нужен - используем NEXT_PUBLIC_API_URL напрямую
  async rewrites() {
    // Если BACKEND_URL указан и это не localhost, используем прокси
    const backendUrl = process.env.BACKEND_URL;
    if (backendUrl && !backendUrl.includes('localhost') && !backendUrl.includes('127.0.0.1')) {
      return [
        {
          source: '/api/:path*',
          destination: `${backendUrl}/api/:path*`,
        },
      ];
    }
    // В одном контейнере - без прокси, используем NEXT_PUBLIC_API_URL
    return [];
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
