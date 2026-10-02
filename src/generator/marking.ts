// Confirm-on-site marking of header values on deliverables.
import type { FieldRecord } from '../domain/fieldRecord';

/** The record as entered, for a record marked by forDeliverables (certification hashes use it). */
export const asEntered = (r: FieldRecord): FieldRecord => entered.get(r) ?? r;
const entered = new WeakMap<FieldRecord, FieldRecord>();

/**
 * Pre-filled values not yet confirmed on site print marked "(UNCONFIRMED)", so they never pass
 * silently. The date is left a date (the forms format it); the on-screen notice flags it.
 */
export function forDeliverables(record: FieldRecord): FieldRecord {
  const keys = (Object.keys(record.unconfirmed ?? {}) as (keyof FieldRecord['header'])[]).filter((k) => k !== 'date');
  if (!keys.length) return record;
  const header = { ...record.header };
  for (const k of keys) if (header[k]) header[k] = `${header[k]} (UNCONFIRMED)`;
  const marked = { ...record, header };
  entered.set(marked, record);
  return marked;
}
