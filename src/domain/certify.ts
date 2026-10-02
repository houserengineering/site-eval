// Certification: a certifier's drawn signature, applied to perc tests only by an explicit Certify
// tap on the certifier's own device. The certified content is hashed; a later edit voids it.
import type { Certification, FieldRecord, PercTest } from './fieldRecord';

/** Kept only on the certifier's device (never in a field record or sync). */
export interface CertifierProfile {
  name: string;
  company: string;
  /** PNG data URL of the drawn signature. */
  signaturePng: string;
}

/** What the certifier signs for a perc test: the test and the header values printed on its form. */
export function certifiedContentHash(record: FieldRecord, test: PercTest): string {
  const { ownerName, projectName, confirmationNumber, date, evalBy } = record.header;
  const pit = record.testPits.find((p) => p.id === test.testPitId);
  return fnv1a(JSON.stringify([test, ownerName, projectName, confirmationNumber, date, evalBy, pit?.label ?? '']));
}

export type CertificationState =
  | { state: 'none' }
  | { state: 'certified'; cert: Certification }
  /** Changed after it was certified: the signature is not applied until certified again. */
  | { state: 'stale'; cert: Certification };

export function certificationState(record: FieldRecord, test: PercTest): CertificationState {
  const cert = record.certifications[test.id];
  if (!cert) return { state: 'none' };
  return cert.hash === certifiedContentHash(record, test) ? { state: 'certified', cert } : { state: 'stale', cert };
}

/** Applies the certifier's signature to the given perc tests, timestamped now. */
export function certify(record: FieldRecord, testIds: string[], who: CertifierProfile, at = new Date().toISOString()): FieldRecord {
  const certifications = { ...record.certifications };
  for (const t of record.percTests.filter((x) => testIds.includes(x.id)))
    certifications[t.id] = { name: who.name, company: who.company, at, hash: certifiedContentHash(record, t), signaturePng: who.signaturePng };
  return { ...record, certifications, updatedAt: new Date().toISOString() };
}

export function withdrawCertification(record: FieldRecord, testId: string): FieldRecord {
  const { [testId]: _, ...certifications } = record.certifications;
  return { ...record, certifications, updatedAt: new Date().toISOString() };
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0') + s.length.toString(16);
}
