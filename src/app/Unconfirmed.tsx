// Confirm-on-site flags: pre-filled header values nobody has verified yet. They block nothing,
// print marked "(UNCONFIRMED)" on deliverables, and clear with one tap (or by typing a value).
import { FEATURES } from './features';
import { confirmHeaderField, type FieldRecord, type Header } from '../domain/fieldRecord';

export const HEADER_LABELS: Record<keyof Header, string> = {
  projectNumber: 'Project #',
  projectName: 'Project name',
  location: 'Location',
  evalBy: 'Evaluated by',
  date: 'Date',
  confirmationNumber: 'Confirmation number',
  county: 'County',
  gallatin: 'Gallatin County site evaluation',
  ownerName: 'Owner name',
};

export function UnconfirmedNotice(props: { record: FieldRecord; save: (r: FieldRecord) => void; context: 'header' | 'preview' }) {
  const r = props.record;
  const keys = Object.keys(r.unconfirmed) as (keyof Header)[];
  if (!keys.length || !FEATURES.UNCONFIRMED_MARKS) return null;
  return (
    <div class="confirm-box" role="region" aria-label="Confirm on site">
      <h3>Confirm on site</h3>
      {props.context === 'preview' && <p>These pre-filled values print marked (UNCONFIRMED) until confirmed.</p>}
      <ul>
        {keys.map((k) => (
          <li key={k}>
            <div>
              <strong>
                {HEADER_LABELS[k]}: {r.header[k] || '(blank)'}
              </strong>
              <span class="confirm-why">{r.unconfirmed[k]}</span>
            </div>
            <button class="btn" onClick={() => props.save(confirmHeaderField(r, k))} aria-label={`Confirm ${r.header[k] || HEADER_LABELS[k]}`}>
              Confirm
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
