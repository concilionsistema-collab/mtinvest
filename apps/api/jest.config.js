/** @type {import('jest').Config} */
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  testRegex: '.*\\.spec\\.ts$',
  // *.integration-spec.ts (jest.integration.config.js) toca o banco real -
  // fica fora da suite padrao (mockada, sem rede) para nao quebrar `npm test`
  // em ambientes sem Postgres disponivel (ex.: CI sem banco provisionado).
  testPathIgnorePatterns: ['/node_modules/', '\\.integration-spec\\.ts$'],
  moduleFileExtensions: ['ts', 'js', 'json'],
};
