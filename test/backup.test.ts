import { describe, expect, it } from 'vitest';
import { backupName, makeBackup, readBackup } from '../src/domain/backup';
import { addTestPit, newSiteEvaluation, updateTestPit } from '../src/domain/fieldRecord';

describe('backup export', () => {
  it('round-trips the record and its photos', async () => {
    let r = addTestPit(newSiteEvaluation({ projectNumber: '0999.001' }), '1');
    r = updateTestPit(r, r.testPits[0].id, { photos: [{ id: 'p1', takenAt: '', width: 1, height: 1 }] });
    const bytes = new Uint8Array(70_000).map((_, i) => i & 255);
    const text = await makeBackup(r, async (id) => (id === 'p1' ? new Blob([bytes], { type: 'image/jpeg' }) : undefined));
    const back = readBackup(JSON.parse(text));
    expect(back.record).toEqual(r);
    expect(back.photos.map((p) => p.id)).toEqual(['p1']);
    expect(new Uint8Array(await back.photos[0].blob.arrayBuffer())).toEqual(bytes);
    expect(back.photos[0].blob.type).toBe('image/jpeg');
  });

  it('names the file by project and time, and rejects other files', () => {
    expect(backupName(newSiteEvaluation({ projectNumber: '0271.001' }), new Date(2026, 9, 2, 13, 7))).toBe('0271.001 Site Evaluation Backup 2026-10-02 1307.json');
    expect(() => readBackup({ kind: 'site-eval-job' })).toThrow(/not a site evaluation backup/);
  });
});
