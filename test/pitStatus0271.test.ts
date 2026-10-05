// The completed 0271 job (Dropbox backup, office PC only): every wall prints a full soil log, so every wall is
// Complete. Before 2026-10-04 all 40 showed In progress for consistence/plasticity, which the template never prints.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrate } from '../src/domain/fieldRecord';
import { groupStatus } from '../src/domain/pitWalls';
import { pitStatus } from '../src/domain/soilLogText';

const BACKUP = 'C:/Users/HouserEngineering/Dropbox/Server/0271/001/Site Eval App/0271.001 Site Evaluation Backup 2026-10-03 1B roots.json';

describe.skipIf(!existsSync(BACKUP))('0271 status (office PC)', () => {
  it('all 40 walls are complete, as printed', () => {
    const r = migrate(JSON.parse(readFileSync(BACKUP, 'utf8')).record);
    expect(r.testPits).toHaveLength(40);
    expect(r.testPits.filter((p) => pitStatus(p, r.testPits) !== 'complete').map((p) => p.label)).toEqual([]);
    expect(groupStatus(r.testPits.filter((p) => p.label.startsWith('9')))).toBe('complete');
  });
});
