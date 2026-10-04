import { describe, expect, it } from 'vitest';
import { dropboxFolder, fallbackFolder, folderProblem, projectFolder } from '../src/sync/naming';
import { FakeSync, OfflineError } from '../src/sync/adapter';
import { planProjectFolder, resolveProjectFolder } from '../src/sync/projectFolder';

it('resolves the entire project number and preserves the server root', () => {
  expect(dropboxFolder('0999.001')).toBe('/Server/0999/001');
  expect(dropboxFolder('0999.001.02')).toBe('/Server/0999/001/02');
  expect(dropboxFolder('/Server')).toBe('/Server');
  expect(dropboxFolder('C:\\Users\\Example\\Dropbox\\Server\\0999\\001')).toBe('/Server/0999/001');
  expect(dropboxFolder('C:\\Users\\Example\\Dropbox (Example Team)\\Server\\0999\\001')).toBe('/Server/0999/001');
});

it('uses the exact existing subproject and repairs a broken saved folder', async () => {
  const adapter = new FakeSync(['/Server/0999/001', '/Server/0999/002', '/Server/Fallback']);
  expect(await resolveProjectFolder(adapter, '0999.001', '/Server/Server/Site Eval App', '/Server/Fallback')).toBe('/Server/0999/001');
  expect(await resolveProjectFolder(adapter, '0999.003', '', '/Server/Fallback')).toBe('/Server/Fallback');
  expect(await resolveProjectFolder(adapter, '0999.003')).toBe('');
  adapter.mkdir('/Server/0999/001/02');
  expect(await resolveProjectFolder(adapter, '0999.001.02')).toBe('/Server/0999/001/02');
  adapter.offline = true;
  await expect(resolveProjectFolder(adapter, '0999.001', '', '/Server/Fallback')).rejects.toBeInstanceOf(OfflineError);
});

it('does not turn unrelated local folders or traversal into server paths', () => {
  expect(dropboxFolder('C:\\Users\\Example\\Downloads')).toBe('');
  expect(dropboxFolder('C:\\Backup\\Server\\0999\\001')).toBe('');
  expect(dropboxFolder('\\\\Backup\\Server\\0999\\001')).toBe('');
  expect(dropboxFolder('\\\\OfficePC\\Shared\\Dropbox\\Server\\0999\\001')).toBe('/Server/0999/001');
  expect(dropboxFolder('../elsewhere')).toBe('');
  expect(folderProblem('C:\\Users\\Example\\Downloads')).toContain('Dropbox Server');
});

it('reads loose project numbers and zero-pads project and subproject', () => {
  for (const typed of ['279-1', '0279.001', '279 1', '0279_001', ' 279.1 ']) expect(projectFolder(typed)).toBe('/Server/0279/001');
  expect(projectFolder('279')).toBe('/Server/0279');
  expect(projectFolder('0999.001.02')).toBe('/Server/0999/001/02');
  for (const unreadable of ['', 'abc', '12', '27901', '0279.', 'Stillwater']) expect(projectFolder(unreadable)).toBe('');
});

it('names one fallback folder per evaluation', () => {
  expect(fallbackFolder({ projectName: 'Stillwater Subdivision', date: '2026-10-03' })).toBe('/Server/Office/Site Evaluations/Stillwater Subdivision 2026-10-03');
  expect(fallbackFolder({ projectName: '  ', date: '2026-10-03' })).toBe('/Server/Office/Site Evaluations/Untitled 2026-10-03');
  expect(fallbackFolder({ projectName: 'Lot 3/4: "A"', date: '' })).toBe('/Server/Office/Site Evaluations/Lot 3-4- -A-');
});

describe('planProjectFolder', () => {
  const header = (projectNumber: string) => ({ projectNumber, projectName: 'Example', date: '2026-10-03' });
  it('uses an existing project folder', async () => {
    const a = new FakeSync(['/Server/0279/001']);
    expect(await planProjectFolder(a, header('279-1'))).toEqual({ kind: 'found', folder: '/Server/0279/001' });
  });
  it('offers to create a missing project folder only when the account has /Server', async () => {
    expect(await planProjectFolder(new FakeSync(['/Server/0001', '/Server/Office']), header('279-1'))).toEqual({ kind: 'missing', folder: '/Server/0279/001' });
    expect(await planProjectFolder(new FakeSync(['/Photos', '/Server/Server/Site Eval App'], 'Personal'), header('279-1'))).toEqual({ kind: 'wrong-account', folder: '/Server/0279/001' });
  });
  it('files a blank or unreadable project number to the fallback folder', async () => {
    const a = new FakeSync(['/Server/0001', '/Server/Office']);
    expect(await planProjectFolder(a, header(''))).toEqual({ kind: 'fallback', folder: '/Server/Office/Site Evaluations/Example 2026-10-03' });
    expect(await planProjectFolder(a, header('see notes'))).toEqual({ kind: 'fallback', folder: '/Server/Office/Site Evaluations/Example 2026-10-03' });
    expect(await planProjectFolder(new FakeSync([], 'Personal'), header(''))).toEqual({ kind: 'wrong-account', folder: '/Server/Office/Site Evaluations/Example 2026-10-03' });
  });
  it('keeps an evaluation in the fallback folder it already uses when the name or date changes', async () => {
    const a = new FakeSync(['/Server/Office/Site Evaluations/Untitled 2026-10-02']);
    expect(await planProjectFolder(a, header(''), '/Server/Office/Site Evaluations/Untitled 2026-10-02')).toEqual({ kind: 'fallback', folder: '/Server/Office/Site Evaluations/Untitled 2026-10-02' });
  });
  it('creates the planned folder', async () => {
    const a = new FakeSync(['/Server/0001', '/Server/Office']);
    await a.createFolder('/Server/0279/001');
    expect(await a.folderExists('/Server/0279/001')).toBe(true);
  });
});
