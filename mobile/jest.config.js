// Barcode feature tests run in Node with ts-jest (no React Native).
// Add a second project with preset "jest-expo" when adding component/integration tests elsewhere.
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/features/barcode/__tests__/**/*.test.ts"],
  transform: {
    "\\.ts$": "ts-jest",
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@shared/(.*)$": "<rootDir>/../shared/$1",
  },
};
