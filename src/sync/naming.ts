// Where the app files things in Dropbox, and what it calls them.
//
// Names follow Houser's newest Gallatin deliverables, which name each document by type and add a
// packet number only when the submittal packet is assembled (`11 Test Pit Logs.pdf`,
// `12 Percolation Tests.xlsx` in 0104.019; `07 Soil Logs`, `12 Percolation Tests` across the
// septic files; the 0271 folder already holds `Soil Logs.xls`). So the app writes the unnumbered
// typed names and leaves numbering to whoever builds the packet.
import type { DeliverableKind } from '../generator';
import type { FieldRecord } from '../domain/fieldRecord';

/** The office server folder in Dropbox; project folders sit directly under it. */
export const SERVER_ROOT = '/Server';
/** Subfolder of the deliverable folder for app data: the synced field record, photos, job files. */
export const APP_FOLDER = 'Site Eval App';
/** Dropped PDFs are printed at the office by the print agent (ticket 10), then moved to `Done`. */
export const PRINT_QUEUE = `${SERVER_ROOT}/Office/Site Eval App/Print Queue`;

export const DELIVERABLE_NAMES: Record<Exclude<DeliverableKind, 'field-record-json'>, string> = {
  'soil-log-xlsx': 'Soil Logs.xlsx',
  'soil-log-pdf': 'Soil Logs.pdf',
  'perc-test-xlsx': 'Percolation Tests.xlsx',
  'perc-test-pdf': 'Percolation Tests.pdf',
  'site-evaluation-pdf': 'Site Evaluation.pdf',
};

/**
 * A deliverable folder as a Dropbox path. Accepts what people paste: `0271\Engineering\…\`,
 * `S:\0271\…`, `C:\Users\…\Dropbox\Server\0271\…`, or a Dropbox path `/Server/0271/…`.
 */
export function dropboxFolder(folder: string): string {
  let f = folder.trim().replace(/\\/g, '/');
  if (!f) return '';
  const server = /(^|\/)server\//i.exec(f);
  if (server) f = f.slice(server.index + server[0].length);
  else f = f.replace(/^[a-z]:\//i, '').replace(/^\/+/, '');
  f = f.replace(/\/+$/, '').replace(/\/{2,}/g, '/');
  return `${SERVER_ROOT}/${f}`;
}

export const appFolder = (r: FieldRecord) => `${dropboxFolder(r.deliverableFolder)}/${APP_FOLDER}`;
export const photoFolder = (r: FieldRecord) => `${appFolder(r)}/Photos`;
/** The synced field record. Keyed by record id so every device finds the same file. */
export const fieldRecordPath = (r: FieldRecord) => `${appFolder(r)}/Field Record ${r.id.slice(0, 8)}.json`;
export const isFieldRecordName = (name: string) => /^Field Record [0-9a-f]{8}\.json$/i.test(name);

export function deliverablePath(r: FieldRecord, kind: keyof typeof DELIVERABLE_NAMES): string {
  return `${dropboxFolder(r.deliverableFolder)}/${DELIVERABLE_NAMES[kind]}`;
}

/** The name used when the conventional one belongs to a file the app did not write. */
export function alternatePath(path: string): string {
  return path.replace(/(\.[^./]+)?$/, (ext) => ` (Site Eval App)${ext}`);
}

/** Print queue file: project and document, stamped so repeated prints never collide. */
export function printQueuePath(r: FieldRecord, kind: keyof typeof DELIVERABLE_NAMES, at = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())} ${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}`;
  const project = r.header.projectNumber.replace(/[\\/:*?"<>|]/g, '-');
  return `${PRINT_QUEUE}/${[project, DELIVERABLE_NAMES[kind].replace(/\.pdf$/, ''), stamp].filter(Boolean).join(' ')}.pdf`;
}
