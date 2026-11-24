// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    /*
     * This repo's own Node scripts are not app code.
     *
     * tools/, plugins/ and the two root config files are plain CommonJS,
     * run by node or by Expo's config resolver long before Metro or React
     * exist. Linted under the Expo app config they have no __dirname, no
     * require and no module, so tools/verify-brand.js reported
     * "'__dirname' is not defined" the first time `eslint .` was run over
     * the whole repo rather than over src/ alone (2026-11-17) — a false
     * positive on a script that has run correctly since it was written.
     */
    files: ["tools/**/*.js", "plugins/**/*.js", "*.config.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        __dirname: "readonly",
        __filename: "readonly",
        require: "readonly",
        module: "writable",
        exports: "writable",
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
      },
    },
  },
]);
