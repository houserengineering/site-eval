// Shape of a template snapshot written by tools/snapshot_soil_log.py from the office template.

export type BorderStyle = 'thin' | 'medium' | 'double' | 'thick' | 'dashed' | 'dotted' | 'hair' | 'mediumDashed';

export interface SnapshotCell {
  value?: string | number;
  font: { name: string; size: number; bold: boolean };
  numFmt: string;
  alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean };
  border?: Partial<Record<'left' | 'right' | 'top' | 'bottom', BorderStyle>>;
  /** Template input highlight (yellow); not printed on deliverables. */
  fill?: string;
  /** Office guidance comment; reused as in-app help, not written to deliverables. */
  comment?: string;
}

export interface SoilLogSnapshot {
  kind: 'soil-log';
  source: { path: string; sha256: string; modified: string; snapshotAt: string };
  sheetName: string;
  columns: Record<string, number>;
  rows: Record<string, number>;
  pageSetup: {
    paperSize: number;
    orientation: 'portrait' | 'landscape';
    fitToPage: boolean;
    fitToWidth: number;
    fitToHeight: number;
    margins: { left: number; right: number; top: number; bottom: number; header: number; footer: number };
  };
  inputs: Record<'projectNumber' | 'projectName' | 'location' | 'evalBy' | 'date' | 'testPitLabel' | 'confirmationNumber', string>;
  horizonTable: {
    headerRow: number;
    firstRow: number;
    rows: number;
    rowHeight: number;
    columns: Record<'designation' | 'depth' | 'color' | 'texture' | 'structure' | 'roots' | 'mottling' | 'notes', string>;
  };
  areas: Record<'photo' | 'location', { label: string; range: string }>;
  images: { file: string; from: { col: number; colOff: number; row: number; rowOff: number }; extEmu: { cx: number; cy: number } }[];
  cells: Record<string, SnapshotCell>;
}

/** Everything the generator needs about the office templates. */
export interface TemplateSet {
  soilLog: { spec: SoilLogSnapshot; logo: Uint8Array };
}
