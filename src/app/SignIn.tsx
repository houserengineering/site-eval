// The sign-in screen in front of the whole app, and Google's button where Dropbox needs a new sign-in.
import { useEffect, useRef, useState } from 'preact/hooks';
import { acceptCredential, COMPANY_DOMAIN, GOOGLE_CLIENT_ID, renderGoogleButton } from './google';
import { syncService } from './sync';

const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;

/** Google's own button; a company account signs in, any other gets a plain reason. */
export function GoogleButton() {
  const el = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState<string>();
  const [online, setOnline] = useState(navigator.onLine);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener('online', on);
    addEventListener('offline', off);
    return () => {
      removeEventListener('online', on);
      removeEventListener('offline', off);
    };
  }, []);
  useEffect(() => {
    if (!online || !GOOGLE_CLIENT_ID) return;
    setProblem(undefined);
    renderGoogleButton(
      el.current!,
      (token) => {
        try {
          const user = acceptCredential(token);
          void syncService()?.signedIn(token, user.name);
        } catch (e: any) {
          setProblem(e.message);
        }
      },
      dark(),
    ).catch((e) => setProblem(e.message));
  }, [online, attempt]);
  if (!GOOGLE_CLIENT_ID) return <p class="alert" role="alert">Google sign-in is not set up yet. Ask the office.</p>;
  return (
    <div class="google-signin">
      {online ? <div class="google-button" ref={el} /> : <p class="sync-line warn" role="status">No signal. Signing in needs signal once; after that the app works without it.</p>}
      {problem && (
        <p class="alert" role="alert">
          {problem}
        </p>
      )}
      {problem && online && (
        <button class="btn small" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      )}
    </div>
  );
}

export function SignInScreen() {
  return (
    <main class="page signin">
      <header class="bar">
        <h1>Site evaluations</h1>
      </header>
      <div class="signin-body">
        <img class="signin-icon" src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width="72" height="72" />
        <p class="signin-org">Houser Engineering</p>
        <h2 class="signin-title">Sign in to start</h2>
        <p class="hint">
          This app is for Houser Engineering staff. Use your <strong>@{COMPANY_DOMAIN}</strong> Google account.
        </p>
        <GoogleButton />
        <p class="hint signin-foot">Sign in once on this phone. After that it works in the field without signal, and saves to the Houser Dropbox through the office.</p>
      </div>
    </main>
  );
}
