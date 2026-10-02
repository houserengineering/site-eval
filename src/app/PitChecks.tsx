// Pit checks on the wall screen (ticket 09): each flag is fixed in the log or accepted as it is;
// accepting records who (the sync name) and when on the wall.
import { acceptFlag, openFlags, wallFlags, type Flag } from '../domain/pitChecks';
import type { FieldRecord, TestPit } from '../domain/fieldRecord';
import { stampText } from '../generator/sitePlan';
import { syncService } from './sync';

export function WallChecks(props: { record: FieldRecord; wall: TestPit; save: (r: FieldRecord) => void }) {
  const flags = wallFlags(props.record, props.wall);
  if (!flags.length) return null;
  const open = flags.filter((f) => !f.accepted).length;
  const accept = (f: Flag) => props.save(acceptFlag(props.record, props.wall.id, f.id, syncService().state.who));
  return (
    <section class="card checks" id="wall-checks" aria-label="Pit checks">
      <h2>
        Pit checks {open > 0 && <span class="badge warn">{open} open</span>}
      </h2>
      <p class="hint">{open ? 'Fix each in the log, or accept it as it is. The soil log is held until none are open.' : 'All accepted.'}</p>
      <ul class="check-list">
        {flags.map((f) => (
          <li key={f.id} class={f.accepted ? 'accepted' : 'open'}>
            <span>{f.message}</span>
            {f.accepted ? (
              <span class="row-sub">
                Accepted by {f.accepted.by} {stampText(f.accepted.at)}
              </span>
            ) : (
              <button type="button" class="btn small" onClick={() => accept(f)} aria-label={`Accept: ${f.message}`}>
                Accept
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Top-of-screen pointer to the open checks. */
export function OpenChecksLink(props: { record: FieldRecord; wall: TestPit }) {
  const n = wallFlags(props.record, props.wall).filter((f) => !f.accepted).length;
  if (!n) return null;
  return (
    <button type="button" class="checks-link" onClick={() => document.getElementById('wall-checks')?.scrollIntoView()}>
      {n} pit check{n === 1 ? '' : 's'} open
    </button>
  );
}

/** Deliverables: the soil log is held while any check is open; links to each wall with open checks. */
export function SoilLogHold(props: { record: FieldRecord }) {
  const r = props.record;
  const open = openFlags(r);
  if (!open.length) return null;
  const walls = [...new Set(open.map((f) => f.wallId))].map((id) => r.testPits.find((p) => p.id === id)!);
  return (
    <section class="hold" aria-label="Soil log held">
      <p>
        <strong>Soil log held:</strong> {open.length} pit check{open.length === 1 ? '' : 's'} open. Fix or accept each to print, export or file the soil log.
      </p>
      <ul class="hold-walls">
        {walls.map((w) => (
          <li key={w.id}>
            <a href={`#/se/${r.id}/pit/${w.id}`}>
              Wall {w.label}: {open.filter((f) => f.wallId === w.id).length} open
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
