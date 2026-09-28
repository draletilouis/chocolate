import type { NextConfig } from 'next';
const config: NextConfig = {
  devIndicators: false,
  // The embedded PostgreSQL used when DATABASE_URL is not set loads its WebAssembly files at run time.
  serverExternalPackages: ['@electric-sql/pglite'],
};
export default config;
