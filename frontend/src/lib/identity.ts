// Who is asking: every API call says which shop it is for (see backend/app/identity.py).
// Signed in with Google: the Firebase ID token (the server checks it with Google).
// Not signed in: a random id for this browser/phone, kept in localStorage, so each device
// gets its own private shop and nobody sees anyone else's khata.

const DEVICE_KEY = "galla.device";

let memoryDeviceId: string | null = null;
let tokenSource: (() => Promise<string>) | null = null;

/** Called by the auth provider when a Google user signs in (or with null on sign-out). */
export function setTokenSource(source: (() => Promise<string>) | null) {
  tokenSource = source;
}

function newId(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      id = newId();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    // Storage blocked (private mode): a fresh shop for this tab only.
    memoryDeviceId ??= newId();
    return memoryDeviceId;
  }
}

export async function identityHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "X-Galla-Device": deviceId() };
  if (tokenSource) {
    try {
      headers.Authorization = `Bearer ${await tokenSource()}`;
    } catch {
      // Token refresh failed (offline): the server answers 401 and the user signs in again.
    }
  }
  return headers;
}
