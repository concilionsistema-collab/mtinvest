/** @type {import('jest').Config} */
// Suite separada da suite unitaria (jest.config.js), que so roda testes
// mockados sem tocar o banco. Esta suite exige DATABASE_URL apontando para
// um Postgres real com as migrations aplicadas (mesmo banco usado por
// `npm run start:dev`, ver README "Como rodar localmente") - por isso nao
// entra no `npm test` padrao nem no CI sem banco disponivel.
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  testRegex: '.*\\.integration-spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 30000,
};
