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
/** The office review service writes its current URL here (`{ url, updatedAt, kind }`; ticket 11). */
export const REVIEW_SERVICE = `${SERVER_ROOT}/Office/Site Eval App/Review Service.json`;
/** Evaluations without a readable project number file here, one subfolder each (Nathan, 2026-10-03). */
export const FALLBACK_ROOT = `${SERVER_ROOT}/Office/Site Evaluations`;

export const DELIVERABLE_NAMES: Record<Exclude<DeliverableKind, 'field-record-json'>, string> = {
  'soil-log-xlsx': 'Soil Logs.xlsx',
  'soil-log-pdf': 'Soil Logs.pdf',
  'soil-log-fills-csv': 'Soil Log Fills.csv',
  'perc-test-xlsx': 'Percolation Tests.xlsx',
  'perc-test-pdf': 'Percolation Tests.pdf',
  // 0105.003 filed `11 Groundwater Observation Results _ Cottonwood.pdf` (packet number and subdivision added at packet time).
  'groundwater-xlsx': 'Groundwater Observation Results.xlsx',
  'groundwater-pdf': 'Groundwater Observation Results.pdf',
};

/**
 * A deliverable folder as a Dropbox path. Accepts what people paste: `0271\Engineering\…\`,
 * `S:\0271\…`, `C:\Users\…\Dropbox\Server\0271\…`, or a Dropbox path `/Server/0271/…`.
 */
export function dropboxFolder(folder: string): string {
  let f = folder.trim().replace(/\\/g, '/');
  if (!f) return '';
  if (/^[a-z]:\//i.test(f) && !/^s:\//i.test(f) && !/\/Dropbox(?: \([^/]+\))?\/Server(?:\/|$)/i.test(f)) return '';
  const server = /(^|\/)server(?:\/|$)/i.exec(f);
  if (server) f = f.slice(server.index + server[0].length);
  else {
    if (/^[a-z]:\//i.test(f) && !/^s:\//i.test(f)) return '';
    f = f.replace(/^s:\//i, '').replace(/^\/+/, '');
  }
  f = f.replace(/\/+$/, '').replace(/\/{2,}/g, '/');
  if (f.split('/').some((part) => part === '.' || part === '..')) return '';
  const number = projectPath(f);
  if (number) f = number;
  return f ? `${SERVER_ROOT}/${f}` : SERVER_ROOT;
}

/**
 * A project number as typed (`0279.001`, `279-1`, `279 1`, `0279_001`) as its folder path under the
 * server: the project padded to 4 digits, the subproject to 3 (as all Server subprojects are),
 * deeper levels as typed. '' when it is not a project number.
 */
function projectPath(project: string): string {
  const p = project.trim();
  if (!/^\d{3,4}(?:[.\-_ ]+\d{1,3})*$/.test(p)) return '';
  const [job, sub, ...deeper] = p.split(/[.\-_ ]+/);
  return [job.padStart(4, '0'), ...(sub ? [sub.padStart(3, '0')] : []), ...deeper].join('/');
}

/** Exact project/subproject folder; never guess a parent or a similarly named folder. */
export function projectFolder(project: string): string {
  const path = projectPath(project);
  return path ? `${SERVER_ROOT}/${path}` : '';
}

/** The fallback folder for one evaluation: `<project name or Untitled> <date>` under FALLBACK_ROOT. */
export function fallbackFolder(header: { projectName: string; date: string }): string {
  const name = `${header.projectName.trim() || 'Untitled'} ${header.date.trim()}`.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  return `${FALLBACK_ROOT}/${name}`;
}

/**
 * Why a folder cannot be the deliverable folder, or undefined if it can. On 0271 the phone filed
 * into `/Server/Server/Site Eval App` (a doubled root), which reached nobody at the office.
 */
export function folderProblem(folder: string): string | undefined {
  const f = dropboxFolder(folder);
  if (!f) return folder.trim() ? 'Enter a project number or a path inside the Dropbox Server folder.' : undefined;
  if (/^\/server\/server(\/|$)/i.test(f)) return `${f} has the server folder twice (${SERVER_ROOT}${SERVER_ROOT}). Choose the project folder under ${SERVER_ROOT}.`;
  if (f.toLowerCase() === SERVER_ROOT.toLowerCase()) return `Choose a project folder under ${SERVER_ROOT}, not ${SERVER_ROOT} itself.`;
  if (f.toLowerCase().endsWith(`/${APP_FOLDER.toLowerCase()}`)) return `${APP_FOLDER} is where the app keeps its own files. Choose the folder above it.`;
  return undefined;
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
