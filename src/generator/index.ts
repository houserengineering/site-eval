// Deliverable generator: the one seam that turns a field record into files.
import type { FieldRecord } from '../domain/fieldRecord';
import type { TemplateSet } from '../templates/types';
import type { Page } from './page';
import { pdfMeasure, writePdf } from './pdf';
import { extraPhotoPages, mapPages, percTestPages, soilLogPages, type PhotoSource, type PrintKind } from './printed';
import { percTestWorkbook } from './percTest';
import { soilLogWorkbook } from './soilLog';
import { forDeliverables } from './marking';

export type { PhotoSource, PrintKind } from './printed';
export { forDeliverables } from './marking';
export type { Page } from './page';

export type DeliverableKind =
  | 'soil-log-xlsx'
  | 'soil-log-pdf'
  | 'perc-test-xlsx'
  | 'perc-test-pdf'
  | 'site-evaluation-pdf'
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
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PDF = 'application/pdf';
const noPhotos: PhotoSource = async () => undefined;

export async function generate(fieldRecord: FieldRecord, templates: TemplateSet, opts: GenerateOptions = {}): Promise<GeneratedFile[]> {
  const record = forDeliverables(fieldRecord);
  const soilWb = soilLogWorkbook(record, templates);
  const percWb = record.percTests.length ? percTestWorkbook(record, templates) : null;
  // Workbook bytes first: rendering pages only reads the workbooks.
  const soilXlsx = new Uint8Array(await soilWb.xlsx.writeBuffer());
  const percXlsx = percWb && new Uint8Array(await percWb.xlsx.writeBuffer());
  const pages = await printPages(record, templates, opts, { soilWb, percWb });
  const date = new Date(record.updatedAt);
  const title = (what: string) => [record.header.projectNumber, record.header.projectName, what].filter(Boolean).join(' ');

  const files: GeneratedFile[] = [
    { kind: 'soil-log-xlsx', path: 'Soil Logs.xlsx', bytes: soilXlsx, mimeType: XLSX },
    { kind: 'soil-log-pdf', path: 'Soil Logs.pdf', bytes: await writePdf(pages['soil-logs'], { title: title('Soil Logs'), date }), mimeType: PDF },
  ];
  if (percXlsx) {
    files.push({ kind: 'perc-test-xlsx', path: 'Percolation Tests.xlsx', bytes: percXlsx, mimeType: XLSX });
    files.push({
      kind: 'perc-test-pdf',
      path: 'Percolation Tests.pdf',
      bytes: await writePdf(pages['perc-tests'], { title: title('Percolation Tests'), date }),
      mimeType: PDF,
    });
  }
  files.push({
    kind: 'site-evaluation-pdf',
    path: 'Site Evaluation.pdf',
    bytes: await writePdf(pages['site-evaluation'], { title: title('Site Evaluation'), date }),
    mimeType: PDF,
  });
  files.push({
    kind: 'field-record-json',
    path: 'Field Record.json',
    bytes: new TextEncoder().encode(JSON.stringify(fieldRecord, null, 1)),
    mimeType: 'application/json',
  });
  return files;
}

/** The printed pages of each PDF deliverable (the print view draws these same pages). */
export async function printPages(
  record: FieldRecord,
  templates: TemplateSet,
  opts: GenerateOptions = {},
  books = { soilWb: soilLogWorkbook(record, templates), percWb: record.percTests.length ? percTestWorkbook(record, templates) : null },
): Promise<Record<PrintKind, Page[]>> {
  const measure = await pdfMeasure();
  const photo = opts.photo ?? noPhotos;
  const soil = await soilLogPages(record, templates, books.soilWb, measure, photo);
  const perc = books.percWb ? percTestPages(books.percWb, measure) : [];
  return {
    'soil-logs': soil,
    'perc-tests': perc,
    'site-evaluation': [...mapPages(record, templates, measure), ...soil, ...perc, ...(await extraPhotoPages(record, templates, measure, photo))],
  };
}
