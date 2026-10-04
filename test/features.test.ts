// Live scope (Nathan, 2026-10-04): main ships the soil log PDF only. On the beta branch the flags are on.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { FEATURES } from '../src/app/features';
import { changeSettings, loadSettings, settings } from '../src/app/settings';
import { addPercTest, newSiteEvaluation } from '../src/domain/fieldRecord';
import { generate } from '../src/generator';
import { addWell } from '../src/groundwater/wells';
import { openStore } from '../src/storage/db';
import { loadTemplatesFromDisk } from './templates';

describe.skipIf(Object.values(FEATURES).some(Boolean))('live scope: the test pit soil log only', () => {
  it('turns every extra module off', () => {
    expect(FEATURES).toEqual({ PERC: false, GROUNDWATER: false, TEXTURE_GUIDE: false, RULE_WARNINGS: false, UNCONFIRMED_MARKS: false });
  });

  it('never shows perc tests, even with the old device setting on, and keeps the stored value', async () => {
    const store = await openStore(`t-${crypto.randomUUID()}`);
    await store.setSetting('settings', { percTests: true });
    await loadSettings(store);
    expect(settings().percTests).toBe(false);
    await changeSettings(store, { motion: 'off' });
    expect(await store.getSetting('settings')).toMatchObject({ percTests: true, motion: 'off' });
  });

  it('files the soil logs without perc or groundwater results, and keeps their data in the field record', async () => {
    const r = addWell(addPercTest(newSiteEvaluation(), '1'), '1');
    const files = await generate(r, loadTemplatesFromDisk(), { percTests: settings().percTests, groundwater: FEATURES.GROUNDWATER });
    expect(files.map((f) => f.kind)).toEqual(['soil-log-xlsx', 'soil-log-pdf', 'field-record-json']);
    const json = JSON.parse(new TextDecoder().decode(files.at(-1)!.bytes));
    expect([json.percTests.length, json.wells.length]).toEqual([1, 1]);
  });
});
