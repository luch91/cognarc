import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '../..',
  testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@cognarc/types$': '<rootDir>/packages/cognarc-types/src/index.ts',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'CommonJS',
          moduleResolution: 'node',
          strict: true,
          esModuleInterop: true,
          exactOptionalPropertyTypes: true,
          noUncheckedIndexedAccess: true,
          paths: {
            '@cognarc/types': ['packages/cognarc-types/src/index.ts'],
          },
        },
      },
    ],
  },
  testTimeout: 30000,
  clearMocks: true,
  setupFiles: ['<rootDir>/tests/integration/setup.ts'],
}

export default config
