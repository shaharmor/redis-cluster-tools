// eslint-disable-next-line @typescript-eslint/no-var-requires, import/no-extraneous-dependencies
const { pathsToModuleNameMapper } = require('ts-jest/utils');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { compilerOptions } = require('./tsconfig');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' }),
  globals: {
    'ts-jest': {
      diagnostics: false,
    },
  },
};
