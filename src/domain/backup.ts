// One-file backup of a site evaluation: the field record plus every photo and the map image, so a
// broken phone does not lose the day. Loads back through "Load job file" on any device.
import { migrate, type FieldRecord } from './fieldRecord';

export const BACKUP_KIND = 'site-eval-backup';

interface Backup {
  kind: typeof BACKUP_KIND;
  version: 1;
  savedAt: string;
  record: FieldRecord;
  photos: Record<string, { type: string; base64: string }>;
}

const toBase64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

export async function makeBackup(r: FieldRecord, getPhoto: (id: string) => Promise<Blob | undefined>): Promise<string> {
  const photos: Backup['photos'] = {};
  const ids = [...r.testPits.flatMap((p) => p.photos.map((x) => x.id)), ...(r.siteMap ? [r.siteMap.imageId] : [])];
  for (const id of ids) {
    const blob = await getPhoto(id);
    if (blob) photos[id] = { type: blob.type, base64: toBase64(new Uint8Array(await blob.arrayBuffer())) };
  }
  const b: Backup = { kind: BACKUP_KIND, version: 1, savedAt: new Date().toISOString(), record: r, photos };
  return JSON.stringify(b);
}

export function isBackup(json: unknown): boolean {
  return !!json && typeof json === 'object' && (json as any).kind === BACKUP_KIND;
}

export function readBackup(json: any): { record: FieldRecord; photos: { id: string; blob: Blob }[] } {
  if (!isBackup(json)) throw new Error('This is not a site evaluation backup.');
  const record = migrate(json.record);
  const photos = Object.entries(json.photos ?? {}).map(([id, p]: [string, any]) => ({
    id,
    blob: new Blob([Uint8Array.from(atob(p.base64), (c) => c.charCodeAt(0))], { type: p.type }),
  }));
  return { record, photos };
}

export function backupName(r: FieldRecord, at = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())} ${p(at.getHours())}${p(at.getMinutes())}`;
  return `${[r.header.projectNumber, 'Site Evaluation Backup', stamp].filter(Boolean).join(' ')}.json`;
}
