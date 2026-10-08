// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react/no-children-prop": "off",
      "react/no-unescaped-entities": "off",
    },
    ignores: ["dist/*", "scripts/*"],
  }
]);
