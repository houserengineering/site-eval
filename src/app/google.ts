// Google sign-in: the app is for Houser Engineering employees only (Nathan, 2026-10-04). The sign-in screen gates
// the app's screens; it is not what protects Dropbox. The app and its source are public, so the office service checks
// the Google ID token itself before it gives any Dropbox access (src/sync/office.ts). After one sign-in the device
// remembers who signed in, so the app keeps working in the field without signal.

/** The site eval web app's OAuth client (public; Google Cloud project under the Houser account). */
export const GOOGLE_CLIENT_ID = '';
export const COMPANY_DOMAIN = 'houserengineering.com';

const USER_KEY = 'site-eval:google-user';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

export interface GoogleUser {
  email: string;
  name: string;
  /** ISO time of the sign-in on this device. */
  signedInAt: string;
}

export interface IdClaims {
  aud?: string;
  email?: string;
  email_verified?: boolean;
  hd?: string;
  name?: string;
  exp?: number;
}

/** The claims of an ID token, unverified (the office service verifies the signature). */
export function decodeIdToken(token: string): IdClaims {
  const part = token.split('.')[1] ?? '';
  const json = decodeURIComponent(
    atob(part.replace(/-/g, '+').replace(/_/g, '/'))
      .split('')
      .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join(''),
  );
  return JSON.parse(json);
}

/** Why this Google account cannot use the app, or undefined for a company account. */
export function accountProblem(c: IdClaims, clientId = GOOGLE_CLIENT_ID): string | undefined {
  const email = (c.email ?? '').toLowerCase();
  if (c.aud !== clientId) return 'That sign-in was for another app. Try again.';
  if (c.hd !== COMPANY_DOMAIN || !email.endsWith(`@${COMPANY_DOMAIN}`))
    return `${c.email || 'That account'} is not a Houser Engineering account. Sign in with your @${COMPANY_DOMAIN} Google account.`;
  if (c.email_verified !== true) return 'Google has not verified that email address yet.';
  return undefined;
}

export function signedInUser(): GoogleUser | undefined {
  try {
    const u = JSON.parse(localStorage.getItem(USER_KEY) ?? 'null');
    return u && typeof u.email === 'string' && u.email.toLowerCase().endsWith(`@${COMPANY_DOMAIN}`) ? u : undefined;
  } catch {
    return undefined;
  }
}

let fresh: { token: string; exp: number } | undefined;

/** Accepts a credential from the Google button: remembers the user and keeps the token for the office sign-in. */
export function acceptCredential(token: string): GoogleUser {
  const c = decodeIdToken(token);
  const problem = accountProblem(c);
  if (problem) throw new Error(problem);
  const user: GoogleUser = { email: c.email!.toLowerCase(), name: c.name || c.email!, signedInAt: new Date().toISOString() };
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {}
  fresh = { token, exp: (c.exp ?? 0) * 1000 };
  for (const fn of listeners) fn(user);
  return user;
}

/** The ID token from the last button sign-in while it is still valid; the app never prompts in the background. */
export function freshIdToken(): string | undefined {
  return fresh && fresh.exp - Date.now() > 2 * 60_000 ? fresh.token : undefined;
}

export function signOut() {
  try {
    localStorage.removeItem(USER_KEY);
  } catch {}
  fresh = undefined;
  (window as any).google?.accounts?.id?.disableAutoSelect?.();
  for (const fn of listeners) fn(undefined);
}

const listeners = new Set<(u: GoogleUser | undefined) => void>();
export function onUserChange(fn: (u: GoogleUser | undefined) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

let loading: Promise<any> | undefined;
let callback: (token: string) => void = () => {};

/** Loads Google Identity Services once and sets this app's client up. */
export function loadGoogle(): Promise<any> {
  return (loading ??= new Promise((resolve, reject) => {
    const ready = () => {
      const g = (window as any).google;
      g.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        hd: COMPANY_DOMAIN,
        ux_mode: 'popup',
        auto_select: false,
        cancel_on_tap_outside: true,
        callback: (r: { credential: string }) => callback(r.credential),
      });
      resolve(g);
    };
    if ((window as any).google?.accounts?.id) return ready();
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = ready;
    s.onerror = () => {
      loading = undefined;
      reject(new Error('Google sign-in did not load. Check the signal and try again.'));
    };
    document.head.appendChild(s);
  }));
}

/** Draws Google's own "Sign in with Google" button in `el`; `onToken` gets each credential. */
export async function renderGoogleButton(el: HTMLElement, onToken: (token: string) => void, dark: boolean) {
  const g = await loadGoogle();
  callback = onToken;
  g.accounts.id.renderButton(el, { type: 'standard', theme: dark ? 'filled_black' : 'outline', size: 'large', text: 'signin_with', shape: 'pill', width: Math.min(400, el.clientWidth || 320) });
}
