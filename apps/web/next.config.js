const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Monorepo: fixa a raiz para o rastreamento de arquivos do build (Next 15+),
  // senao ele tenta inferir e avisa por causa do lockfile na raiz do workspace.
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

module.exports = nextConfig;
