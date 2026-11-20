/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@amzur/db'],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  },
};

module.exports = nextConfig;
