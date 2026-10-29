import type { Config } from 'jest'
const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: {
      module: 'ESNext', moduleResolution: 'Bundler',
      target: 'ES2020', lib: ['ES2020','DOM'], types: ['jest', 'node'],
      isolatedModules: true,
    } }],
  },
  testMatch: ['**/tests/**/*.test.ts'],
}
export default config
