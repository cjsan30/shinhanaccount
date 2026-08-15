import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.cjsan30.shinhanhae.calculator',
  appName: '\uC2E0\uCCAD\uD574 \uACC4\uC0B0\uAE30',
  webDir: 'dist',
  plugins: {
    CapacitorSQLite: { androidIsEncryption: true },
  },
};

export default config;