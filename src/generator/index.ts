// Deliverable generator: the one seam that turns a field record into files.
import type { FieldRecord } from '../domain/fieldRecord';
import type { TemplateSet } from '../templates/types';
import type { Page } from './page';
import { pdfMeasure, writePdf } from './pdf';
import { percTestPages, soilLogPages, type PhotoSource, type PrintKind } from './printed';
import { percTestWorkbook } from './percTest';
import { soilLogWorkbook } from './soilLog';
import { forDeliverables } from './marking';
import { groundwaterWorkbook } from '../groundwater/resultsWorkbook';
import { layoutSheet } from './sheetPage';
import { fillRecord, type Fill } from '../domain/fillGaps';

export type { PhotoSource, PrintKind } from './printed';
export { forDeliverables } from './marking';
export type { Page } from './page';

export type DeliverableKind =
  | 'soil-log-xlsx'
  | 'soil-log-pdf'
  | 'perc-test-xlsx'
  | 'perc-test-pdf'
  | 'groundwater-xlsx'
  | 'groundwater-pdf'
  | 'soil-log-fills-csv'
  | 'field-record-json';

export interface GeneratedFile {
  kind: DeliverableKind;
  path: string;
  bytes: Uint8Array;
  mimeType: string;
}

export interface GenerateOptions {
  /** Pit photo bytes; without it the printed logs say the photo is not on this device. */
  photo?: PhotoSource;
  /** The perc test module (a device setting); off leaves perc tests out of every deliverable. Default on. */
  percTests?: boolean;
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PDF = 'application/pdf';
const noPhotos: PhotoSource = async () => undefined;

export async function generate(fieldRecord: FieldRecord, templates: TemplateSet, opts: GenerateOptions = {}): Promise<GeneratedFile[]> {
  const record = forDeliverables(fieldRecord);
  // Each wall's first photo goes into the workbook as well as the printed log.
  const photos = new Map<string, Uint8Array>();
  for (const ref of record.testPits.flatMap((p) => p.photos.slice(0, 1))) {
    const bytes = await (opts.photo ?? noPhotos)(ref.id);
    if (bytes) photos.set(ref.id, bytes);
  }
  const { pits, fills } = fillRecord(record);
  const soilWb = soilLogWorkbook({ ...record, testPits: pits }, templates, photos);
  const percWb = withPerc(record, opts) ? percTestWorkbook(record, templates) : null;
  const gwWb = record.wells.length ? groundwaterWorkbook(record) : null;
  // Workbook bytes first: rendering pages only reads the workbooks.
  const soilXlsx = new Uint8Array(await soilWb.xlsx.writeBuffer());
  const percXlsx = percWb && new Uint8Array(await percWb.xlsx.writeBuffer());
  const gwXlsx = gwWb && new Uint8Array(await gwWb.xlsx.writeBuffer());
  const pages = await printPages(record, templates, opts, { soilWb: soilLogWorkbook({ ...record, testPits: pits }, templates), percWb, gwWb });
  const date = new Date(record.updatedAt);
  const title = (what: string) => [record.header.projectNumber, record.header.projectName, what].filter(Boolean).join(' ');

  const files: GeneratedFile[] = [
    { kind: 'soil-log-xlsx', path: 'Soil Logs.xlsx', bytes: soilXlsx, mimeType: XLSX },
    { kind: 'soil-log-pdf', path: 'Soil Logs.pdf', bytes: await writePdf(pages['soil-logs'], { title: title('Soil Logs'), date }), mimeType: PDF },
  ];
  if (fills.length) files.push({ kind: 'soil-log-fills-csv', path: 'Soil Log Fills.csv', bytes: new TextEncoder().encode(fillsCsv(fills)), mimeType: 'text/csv' });
  if (percXlsx) {
    files.push({ kind: 'perc-test-xlsx', path: 'Percolation Tests.xlsx', bytes: percXlsx, mimeType: XLSX });
    files.push({
      kind: 'perc-test-pdf',
      path: 'Percolation Tests.pdf',
      bytes: await writePdf(pages['perc-tests'], { title: title('Percolation Tests'), date }),
      mimeType: PDF,
    });
  }
  if (gwXlsx) {
    files.push({ kind: 'groundwater-xlsx', path: 'Groundwater Observation Results.xlsx', bytes: gwXlsx, mimeType: XLSX });
    files.push({
      kind: 'groundwater-pdf',
      path: 'Groundwater Observation Results.pdf',
      bytes: await writePdf(pages.groundwater, { title: title('Groundwater Observation Results'), date }),
      mimeType: PDF,
    });
  }
  files.push({
    kind: 'field-record-json',
    path: 'Field Record.json',
    bytes: new TextEncoder().encode(JSON.stringify(fieldRecord, null, 1)),
    mimeType: 'application/json',
  });
  return files;
}

/** Blank horizon fields print the deterministic fill (domain/fillGaps); the fills are filed for review. */
const filledLogs = (record: FieldRecord): FieldRecord => ({ ...record, testPits: fillRecord(record).pits });

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** The review table: every filled field with where its value came from. */
export function fillsCsv(fills: Fill[]): string {
  const rows = [['Wall', 'Horizon', 'Field', 'Value', 'Source'], ...fills.map((f) => [f.wall, f.horizon, f.field, f.value, f.source])];
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const withPerc = (record: FieldRecord, opts: GenerateOptions) => opts.percTests !== false && record.percTests.length > 0;

/** The printed pages of each PDF deliverable (the print view draws these same pages). */
export async function printPages(
  record: FieldRecord,
  templates: TemplateSet,
  opts: GenerateOptions = {},
  books = {
    soilWb: soilLogWorkbook(filledLogs(record), templates),
    percWb: withPerc(record, opts) ? percTestWorkbook(record, templates) : null,
    gwWb: record.wells.length ? groundwaterWorkbook(record) : null,
  },
): Promise<Record<PrintKind, Page[]>> {
  const measure = await pdfMeasure();
  const photo = opts.photo ?? noPhotos;
  const soil = await soilLogPages(filledLogs(record), templates, books.soilWb, measure, photo);
  const perc = books.percWb ? percTestPages(books.percWb, measure) : [];
  return {
    'soil-logs': soil,
    'perc-tests': perc,
    groundwater: books.gwWb ? books.gwWb.worksheets.map((ws) => layoutSheet(books.gwWb!, ws, measure).page) : [],
  };
}
