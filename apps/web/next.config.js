const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Monorepo: fixa a raiz para o rastreamento de arquivos do build (Next 15+),
  // senao ele tenta inferir e avisa por causa do lockfile na raiz do workspace.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // Next 16 gera AGENTS.md/CLAUDE.md dentro de apps/web a cada `next dev`.
  // Este projeto ja tem sua propria documentacao (README, memoria) - desligado
  // para nao criar arquivo concorrente/confuso.
  agentRules: false,
};

module.exports = nextConfig;
