import type { SyncAdapter } from './adapter';
import { dropboxFolder, folderProblem, projectFolder } from './naming';

/** Resolve against the connected account, without inventing or creating project folders. */
export async function resolveProjectFolder(adapter: SyncAdapter, project: string, saved = '', fallback = ''): Promise<string> {
  const preferred = dropboxFolder(saved);
  if (preferred && !folderProblem(preferred) && await adapter.folderExists(preferred)) return preferred;
  const exact = projectFolder(project);
  if (exact && await adapter.folderExists(exact)) return exact;
  const fixed = dropboxFolder(fallback);
  return fixed && !folderProblem(fixed) && await adapter.folderExists(fixed) ? fixed : '';
}
