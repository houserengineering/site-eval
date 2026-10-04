// The Dropbox setup link: `#/dropbox-setup/<refresh token>`. The office PC connects the Houser
// Dropbox once and gives each phone this link; opening it once connects that phone for good, because
// the phone renews its own access with the refresh token (Nathan, 2026-10-04: "never needs
// reconfigured"). The token is in the fragment, so it never reaches GitHub Pages, and it is taken out of
// the address bar and history before anything renders. It is never part of the public app itself.

const PATTERN = /^#\/dropbox-setup\/([A-Za-z0-9_-]{20,512})$/;

/** The refresh token in a setup link's hash; undefined for any other hash. */
export function parseDropboxSetupHash(hash: string): string | undefined {
  return PATTERN.exec(hash)?.[1];
}

/** The setup link opened at start-up, if any, replaced in place by `#/settings`. */
export function takeDropboxSetup(): string | undefined {
  const token = parseDropboxSetupHash(location.hash);
  if (token) history.replaceState(history.state, '', '#/settings');
  return token;
}

/** The link that connects another phone to the same Dropbox account. */
export const dropboxSetupLink = (refreshToken: string) => `${location.origin}${location.pathname}#/dropbox-setup/${refreshToken}`;

let result: string | undefined;

/** Records how the setup link went: 'ok', or why it failed. Settings shows it once. */
export const setDropboxSetupResult = (r: string) => void (result = r);

export function takeDropboxSetupResult(): string | undefined {
  const r = result;
  result = undefined;
  return r;
}
