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

export async function signInWithGoogle(config: FirebaseWebConfig): Promise<User> {
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
}

export async function watchUser(
  config: FirebaseWebConfig,
  cb: (user: User | null) => void,
): Promise<() => void> {
  const auth = await getFirebaseAuth(config);
  const { onAuthStateChanged } = await import("firebase/auth");
  return onAuthStateChanged(auth, cb);
}
