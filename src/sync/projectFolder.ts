import type { SyncAdapter } from './adapter';
import { dropboxFolder, fallbackFolder, FALLBACK_ROOT, folderProblem, projectFolder, SERVER_ROOT } from './naming';

/** Every Houser server account has it; an account without it is the wrong one. */
export const OFFICE = `${SERVER_ROOT}/Office`;

/**
 * Where an evaluation files in the connected account (Nathan, 2026-10-03):
 * - `found`: the project folder exists.
 * - `missing`: a readable project number whose folder does not exist; ask before creating it.
 * - `fallback`: blank or unreadable project number; one subfolder of FALLBACK_ROOT per evaluation.
 * - `wrong-account`: the account has no /Server/Office, so nothing is created or filed. (A bare
 *   /Server is not proof: the 0271 phone wrote /Server/Server/… into the wrong account.)
 */
export type FolderPlan = { kind: 'found' | 'missing' | 'fallback' | 'wrong-account'; folder: string };

export async function planProjectFolder(adapter: SyncAdapter, header: { projectNumber: string; projectName: string; date: string }, saved = ''): Promise<FolderPlan> {
  const exact = projectFolder(header.projectNumber);
  if (exact && (await adapter.folderExists(exact))) return { kind: 'found', folder: exact };
  const current = dropboxFolder(saved);
  const folder = exact || (current.toLowerCase().startsWith(`${FALLBACK_ROOT.toLowerCase()}/`) ? current : fallbackFolder(header));
  if (!(await adapter.folderExists(OFFICE))) return { kind: 'wrong-account', folder };
  return { kind: exact ? 'missing' : 'fallback', folder };
}

/** Resolve against the connected account, without inventing or creating project folders. */
export async function resolveProjectFolder(adapter: SyncAdapter, project: string, saved = '', fallback = ''): Promise<string> {
  const preferred = dropboxFolder(saved);
  if (preferred && !folderProblem(preferred) && await adapter.folderExists(preferred)) return preferred;
  const exact = projectFolder(project);
  if (exact && await adapter.folderExists(exact)) return exact;
  const fixed = dropboxFolder(fallback);
  return fixed && !folderProblem(fixed) && await adapter.folderExists(fixed) ? fixed : '';
}
