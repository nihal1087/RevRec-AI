import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts", "**/*.spec.ts"],
  moduleFileExtensions: ["ts", "js", "json", "node"],
  moduleNameMapper: {
    "^@revrec/types(.*)$": "<rootDir>/../../packages/types/src$1",
    "^@revrec/db(.*)$": "<rootDir>/../../packages/db/src$1",
    // Mock @bull-board packages — they ship ESM which Jest (CommonJS mode) cannot parse.
    // In tests, Bull Board UI is never exercised, so a no-op mock is correct.
    "^@bull-board/api$": "<rootDir>/src/__mocks__/@bull-board/api.ts",
    "^@bull-board/api/bullMQAdapter$": "<rootDir>/src/__mocks__/@bull-board/bullMQAdapter.ts",
    "^@bull-board/express$": "<rootDir>/src/__mocks__/@bull-board/express.ts",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.json",
      },
    ],
  },
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};

export default config;
