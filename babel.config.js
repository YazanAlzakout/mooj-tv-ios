/**
 * Reanimated 4 compiles its worklets through `react-native-worklets/plugin`.
 * Without this file the plugin never runs, the worklets runtime never
 * installs its globals, and the app dies on launch with
 * "Property 'MessageQueue' doesn't exist" / "Global was not installed"
 * before any JS renders.
 *
 * This wasn't needed while `react-native-reanimated` was only an unused
 * transitive dependency; it became required the moment app code started
 * importing it (animated screens, BouncePressable, FloatingParticles).
 *
 * The worklets plugin must stay LAST in the plugins array — it rewrites
 * function bodies and has to see the output of every other transform.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-worklets/plugin"],
  };
};
