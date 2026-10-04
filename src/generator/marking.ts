// Confirm-on-site marking of header values on deliverables.
import type { FieldRecord } from '../domain/fieldRecord';
import { FEATURES } from '../app/features';

/** The record as entered, for a record marked by forDeliverables (certification hashes use it). */
export const asEntered = (r: FieldRecord): FieldRecord => entered.get(r) ?? r;
const entered = new WeakMap<FieldRecord, FieldRecord>();

/**
 * Pre-filled values not yet confirmed on site print marked "(UNCONFIRMED)", so they never pass
 * silently. The date is left a date (the forms format it); the on-screen notice flags it.
 */
export function forDeliverables(record: FieldRecord): FieldRecord {
  // Off on live (app/features.ts): office-prefilled values print plainly.
  if (!FEATURES.UNCONFIRMED_MARKS) return record;
  const keys = (Object.keys(record.unconfirmed ?? {}) as (keyof FieldRecord['header'])[]).filter((k) => k !== 'date' && k !== 'county' && k !== 'gallatin');
  if (!keys.length) return record;
  const header = { ...record.header };
  for (const k of keys) if (header[k]) header[k] = `${header[k]} (UNCONFIRMED)`;
  const marked = { ...record, header };
  entered.set(marked, record);
  return marked;
}
