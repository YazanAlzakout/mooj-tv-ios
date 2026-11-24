const BRAND = require('./brand.config');

// 2026-11-25: independent build identity, without the original EAS project
// or Android signing plugins. An optional EAS id belongs to this repo only.
module.exports = {
  expo: {
    name: BRAND.displayName,
    slug: BRAND.slug,
    version: '1.0.0',
    platforms: ['ios'],
    orientation: 'default',
    icon: './assets/images/ios-icon-1024.png',
    scheme: BRAND.scheme,
    userInterfaceStyle: 'automatic',
    ios: {
      bundleIdentifier: BRAND.bundleIdentifier,
      buildNumber: process.env.IOS_BUILD_NUMBER || '1',
      supportsTablet: false,
      requireFullScreen: true,
      infoPlist: {
        NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    plugins: [
      'expo-router', 'expo-image',
      ['expo-secure-store', { faceIDPermission: false }],
      'expo-sqlite', 'expo-localization',
      ['expo-audio', { enableBackgroundPlayback: false, microphonePermission: false, recordAudioAndroid: false }],
      ['expo-splash-screen', {
        image: './assets/images/splash-blank.png', imageWidth: 200,
        resizeMode: 'contain', backgroundColor: '#0A0A0F',
      }],
      ['expo-video', { supportsBackgroundPlayback: true, supportsPictureInPicture: true }],
    ],
    experiments: { typedRoutes: true },
    extra: {
      isTvBuild: false,
      brand: { key: BRAND.key, displayName: BRAND.displayName, wordmark: BRAND.wordmark, databaseName: BRAND.databaseName },
      ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
    },
  },
};
