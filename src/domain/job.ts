// Job files: a site evaluation pre-filled at the office (header, planned test pits, the test pit
// map and its georeference), loaded on the device from a file or Dropbox. Job files hold client
// data, so they live with the project, never in this repository.
import { addPitWalls, newSiteEvaluation, type FieldRecord, type Header, type LatLon, type SiteMap } from './fieldRecord';
import type { Georef } from './georef';

export const JOB_VERSION = 1;

export interface JobFile {
  kind: 'site-eval-job';
  version: number;
  header: Partial<Header>;
  /** Header fields to confirm on site, with the reason. */
  unconfirmed?: Partial<Record<keyof Header, string>>;
  deliverableFolder?: string;
  testPits: { label: string; planned?: LatLon | null }[];
  map?: {
    title: string;
    source: string;
    mimeType: string;
    width: number;
    height: number;
    /** Base64 image bytes. */
    image: string;
    pins: SiteMap['pins'];
    georef: Georef;
  };
}

const notJob = () => new Error('This is not a site evaluation job file.');

/** Reads a job file into a new field record plus the map image to store beside it. */
export function readJob(text: string): { record: FieldRecord; mapImage: { id: string; blob: Blob } | null } {
  let job: JobFile;
  try {
    job = JSON.parse(text);
  } catch {
    throw notJob();
  }
  if (!job || job.kind !== 'site-eval-job' || !Array.isArray(job.testPits)) throw notJob();
  if (job.version > JOB_VERSION) throw new Error(`This job file (v${job.version}) is newer than this app; update the app.`);

  const text_ = (v: unknown) => (v == null ? '' : String(v));
  const header = Object.fromEntries(Object.entries(job.header ?? {}).map(([k, v]) => [k, text_(v)])) as Partial<Header>;
  let r = newSiteEvaluation(header);
  // Job pits are pit numbers (CAD/onX); each becomes walls A and B sharing the planned location.
  for (const p of job.testPits) r = addPitWalls(r, text_(p.label), { planned: p.planned ?? null });
  r = { ...r, unconfirmed: { ...(job.unconfirmed ?? {}) }, deliverableFolder: text_(job.deliverableFolder) };

  let mapImage = null;
  if (job.map) {
    const m = job.map;
    const bytes = Uint8Array.from(atob(m.image), (c) => c.charCodeAt(0));
    mapImage = { id: crypto.randomUUID(), blob: new Blob([bytes], { type: m.mimeType }) };
    r = { ...r, siteMap: { title: m.title, source: m.source, imageId: mapImage.id, mimeType: m.mimeType, width: m.width, height: m.height, pins: m.pins, georef: m.georef } };
  }
  return { record: r, mapImage };
}
