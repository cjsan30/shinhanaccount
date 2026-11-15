import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.cjsan30.shinhanhae.calculator',
  appName: '\uC2E0\uCCAD\uD574 \uACC4\uC0B0\uAE30',
  webDir: 'dist',
  // Matches the app background so any area the WebView has not painted yet
  // (e.g. right after returning from the photo picker) stays dark, not white.
  backgroundColor: '#121922',
  plugins: {
    CapacitorSQLite: { androidIsEncryption: true },
  },
};

export default config;