// Optional Google login. The config comes from /api/config at runtime, so the same
// Docker image runs with login (keys in .env) or without it (judges, no keys).
// Firebase is loaded lazily: without a config, none of its code is downloaded.

import type { Auth, User } from "firebase/auth";

import type { FirebaseWebConfig } from "./types";

let authPromise: Promise<Auth> | null = null;

export function getFirebaseAuth(config: FirebaseWebConfig): Promise<Auth> {
  authPromise ??= (async () => {
    const [{ initializeApp, getApps }, { getAuth }] = await Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
    ]);
    const app = getApps()[0] ?? initializeApp(config);
    return getAuth(app);
  })();
  return authPromise;
}

/**
 * Inside the Android app, Google blocks its sign-in popup (WebViews aren't allowed), so the phone's
 * own account picker signs in natively and hands us a Google ID token; the same web Firebase login
 * then takes over, so the server sees the same account (and the same shop) as on the website.
 */
async function signInNative(config: FirebaseWebConfig): Promise<User> {
  const auth = await getFirebaseAuth(config);
  const [{ FirebaseAuthentication }, { GoogleAuthProvider, signInWithCredential }] = await Promise.all([
    import("@capacitor-firebase/authentication"),
    import("firebase/auth"),
  ]);
  let idToken: string | undefined;
  try {
    const res = await FirebaseAuthentication.signInWithGoogle();
    idToken = res.credential?.idToken;
  } catch (e) {
    // Closing the account picker is not an error.
    if (/cancel/i.test(String((e as Error)?.message ?? e))) throw Object.assign(new Error("cancelled"), { code: "auth/popup-closed-by-user" });
    throw e;
  }
  if (!idToken) throw Object.assign(new Error("No Google token"), { code: "auth/popup-closed-by-user" });
  const result = await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  return result.user;
}

export async function signInWithGoogle(config: FirebaseWebConfig): Promise<User> {
  const { isNativeApp } = await import("./native");
  if (isNativeApp()) return signInNative(config);
  const auth = await getFirebaseAuth(config);
  const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutUser(config: FirebaseWebConfig): Promise<void> {
  const auth = await getFirebaseAuth(config);
  const { signOut } = await import("firebase/auth");
  await signOut(auth);
  const { isNativeApp } = await import("./native");
  if (isNativeApp()) {
    // Also forget the phone's Google choice, so the account picker shows next time.
    const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
    await FirebaseAuthentication.signOut().catch(() => undefined);
  }
}

export async function watchUser(
  config: FirebaseWebConfig,
  cb: (user: User | null) => void,
): Promise<() => void> {
  const auth = await getFirebaseAuth(config);
  const { onAuthStateChanged } = await import("firebase/auth");
  return onAuthStateChanged(auth, cb);
}
