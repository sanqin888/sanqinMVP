const nextJest = require("next/jest.js");

const createJestConfig = nextJest({
  dir: "./",
});

/** @type {import("jest").Config} */
const config = {
  clearMocks: true,
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/?(*.)+(spec|test).[jt]s?(x)"],
};

module.exports = createJestConfig(config);
