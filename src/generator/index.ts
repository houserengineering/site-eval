// Deliverable generator: the one seam that turns a field record into files.
import type { FieldRecord } from '../domain/fieldRecord';
import type { TemplateSet } from '../templates/types';
import { soilLogXlsx } from './soilLog';

export type DeliverableKind = 'soil-log-xlsx' | 'field-record-json';

export interface GeneratedFile {
  kind: DeliverableKind;
  path: string;
  bytes: Uint8Array;
  mimeType: string;
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function generate(record: FieldRecord, templates: TemplateSet): Promise<GeneratedFile[]> {
  return [
    { kind: 'soil-log-xlsx', path: 'Soil Logs.xlsx', bytes: await soilLogXlsx(record, templates), mimeType: XLSX },
    {
      kind: 'field-record-json',
      path: 'Field Record.json',
      bytes: new TextEncoder().encode(JSON.stringify(record, null, 1)),
      mimeType: 'application/json',
    },
  ];
}
