// The enrollment link for AI photo review (ticket 12): `#/enroll/<device token>?u=<service URL>`, sent
// privately to one phone. The token is in the fragment, so it never reaches GitHub Pages; it is taken out
// of the address bar and history before anything renders.

export interface Enrollment {
  token: string;
  /** The review service URL when the link carries one; seeds the cached URL for a phone without Dropbox. */
  serviceUrl?: string;
}

/** Reads an enrollment link's hash; undefined for any other hash or a malformed token. */
export function parseEnrollHash(hash: string): Enrollment | undefined {
  const m = /^#\/enroll\/([A-Za-z0-9_-]{8,200})(?:\?(.*))?$/.exec(hash);
  if (!m) return undefined;
  const u = new URLSearchParams(m[2] ?? '').get('u');
  return { token: m[1], serviceUrl: u && /^https:\/\/[^\s/]+/.test(u) ? u : undefined };
}

/** The enrollment link opened at start-up, if any, replaced in place by `#/settings`. */
export function takeEnrollment(): Enrollment | undefined {
  const e = parseEnrollHash(location.hash);
  if (e) history.replaceState(history.state, '', '#/settings');
  return e;
}

let enrolledNow = false;

/** Marks this launch as enrolled, so Settings confirms it once. */
export const markEnrolled = () => void (enrolledNow = true);

/** True once after an enrollment link was saved. */
export function takeEnrolledNotice(): boolean {
  const was = enrolledNow;
  enrolledNow = false;
  return was;
}
