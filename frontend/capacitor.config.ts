// Galla as an Android app (Capacitor). The app is a native shell around the SAME Next.js
// frontend: it loads the Galla server at CAP_SERVER_URL, so every screen, language and
// feature is identical to the website. All data lives on the server anyway.
//
//   Phone on the same Wi-Fi as your laptop (live reload while developing):
//     $env:CAP_SERVER_URL="http://192.168.1.20:3000"; npx cap sync android
//   Your deployed server (HTTPS):
//     $env:CAP_SERVER_URL="https://34-93-1-2.sslip.io"; npx cap sync android
//   Then open android/ in Android Studio (npx cap open android) and press Run.
//
// The mic and read-aloud use native Android speech inside the app (no Web Speech API in
// Android's WebView); with WISPR_API_KEY set on the server, the mic uses Wispr Flow instead.

import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAP_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: "in.galla.app",
  appName: "BolKhata",
  // Small local pages bundled in the APK: shown if no server is set or it can't be reached.
  webDir: "mobile/www",
  backgroundColor: "#faf6ee",
  server: serverUrl
    ? {
        url: serverUrl,
        // Plain http is only for a laptop dev server on your Wi-Fi.
        cleartext: serverUrl.startsWith("http://"),
        androidScheme: "https",
        errorPath: "offline.html",
      }
    : { androidScheme: "https" },
  android: {
    allowMixedContent: false,
  },
};

export default config;
