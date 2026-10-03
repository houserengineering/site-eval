import { expect, it } from 'vitest';
import { dropboxFolder, folderProblem } from '../src/sync/naming';
import { FakeSync, OfflineError } from '../src/sync/adapter';
import { resolveProjectFolder } from '../src/sync/projectFolder';

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
  expect(dropboxFolder('../elsewhere')).toBe('');
  expect(folderProblem('C:\\Users\\Example\\Downloads')).toContain('Dropbox Server');
});
