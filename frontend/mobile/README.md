# Galla Android app (Capacitor)

The Android app is a native shell around the **same Next.js frontend**: it loads your Galla
server, so every screen, language and feature matches the website. Inside the app:

- **Mic:** Wispr Flow when `WISPR_API_KEY` is set on the server; otherwise Android's own speech
  recognition (Android's WebView has no Web Speech API, so the browser engine isn't available).
- **Read-aloud:** Android's text-to-speech voice.
- **Bill scan:** the camera opens from "Take photo" (needs internet the first time, for the OCR model).
- **Offline:** a friendly "no internet, try again" screen (`mobile/www/offline.html`).

Needs Android Studio (it brings the Android SDK and a JDK). Run commands from `frontend/`.

## A. Your phone or emulator against your laptop (live reload)

1. Find your laptop's Wi-Fi IP: `ipconfig` → IPv4 Address, e.g. `192.168.1.20`.
2. Start the backend (port 8000) as usual, then the frontend so the phone can reach it:
   ```powershell
   $env:DEV_ORIGINS="192.168.1.20"; npm run dev:lan
   ```
3. Point the app at it and open Android Studio:
   ```powershell
   $env:CAP_SERVER_URL="http://192.168.1.20:3000"; npm run cap:sync; npm run android:open
   ```
   For the **emulator** you can use `http://10.0.2.2:3000` instead (the emulator's name for your laptop).
4. In Android Studio pick your phone (USB debugging on: Settings → About → tap Build number 7×,
   then Developer options → USB debugging) or an emulator, and press **Run ▶**.

Code changes reload in the app like in a browser. Over plain `http://` the mic and camera may be
blocked by the WebView on some phones; use B for the full experience.

## B. Against your deployed server (HTTPS)

```powershell
$env:CAP_SERVER_URL="https://34-93-1-2.sslip.io"; npm run cap:sync; npm run android:open
```

Then Run ▶, or Build → Generate Signed App Bundle / APK to share it.

## Notes

- The server address is baked in at `cap sync` time (`android/app/src/main/assets/capacitor.config.json`,
  git-ignored). Sync again after changing it.
- Google sign-in uses a popup, which Google blocks inside app WebViews. In the app, use the demo
  without sign-in for now (finale work: native Google sign-in plugin).
- App id `in.galla.app`, minimum Android 7.0 (API 24). Permissions: internet, microphone, camera.
