/** @type {import('jest').Config} */
// Suite separada da unitaria (jest.config.js) e da de integracao
// (jest.integration.config.js). Aqui sobe a aplicacao Nest de verdade
// (Test.createTestingModule + supertest, HTTP real) contra o mesmo Postgres
// real usado por `npm run start:dev` (DATABASE_URL/MIGRATE_DATABASE_URL,
// ver README "Como rodar localmente") - por isso tambem fica fora do
// `npm test` padrao. Cobre o que teste de service com Prisma mockado
// estruturalmente nao cobre: ValidationPipe (whitelist/forbidNonWhitelisted/
// transform), JwtAuthGuard endpoint a endpoint, e a fiacao real de
// modulo -> controller -> rota.
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  testRegex: '.*\\.e2e-spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 30000,
  // Ocasionalmente o Jest avisa "worker process has failed to exit
  // gracefully" - inofensivo (exit code continua 0, testes continuam
  // corretos), provavelmente uma conexao Prisma administrativa extra do
  // helper de setup (test-utils/e2e-app.helper.ts) nao fechando a tempo do
  // teardown do proprio Jest. Nao investigado a fundo (nao afeta CI nem
  // resultado), registrado aqui para nao gerar susto se aparecer de novo.
};
