module.exports = {
    norpc: true,
    testCommand: "npx hardhat test test/unit-test/**/*.ts",
    compileCommand: "npm run compile",
    skipFiles: [
      './interfaces',
      './oz',
      './test',
      './utils'
    ],
    mocha: {
      fgrep: "[skip-on-coverage]",
      invert: true,
    },
  };