// Shared ExcelJS helpers for drawing office template snapshots.
import type ExcelJS from 'exceljs';
import type { SnapshotCell } from '../templates/types';

/** Applies a snapshot cell's value and print styling (not its typist fill or comment). */
export function styleCell(cell: ExcelJS.Cell, c: SnapshotCell) {
  if (c.value !== undefined) cell.value = c.value;
  cell.font = { name: c.font.name, size: c.font.size, bold: c.font.bold };
  if (c.numFmt !== 'General') cell.numFmt = c.numFmt;
  if (c.alignment) {
    // Excel's "center" vertical alignment is ExcelJS's "middle".
    const { vertical, ...rest } = c.alignment;
    cell.alignment = { ...rest, ...(vertical && { vertical: vertical === 'center' ? 'middle' : vertical }) } as ExcelJS.Alignment;
  }
  if (c.border) {
    cell.border = Object.fromEntries(Object.entries(c.border).map(([side, style]) => [side, { style }])) as unknown as ExcelJS.Borders;
  }
  // c.fill (yellow) marks input cells for office typists; deliverables print without it.
  // c.comment is typist guidance; it becomes in-app help, not a deliverable comment.
}

/** `B12` → { col: 'B', row: 12 }. */
export function splitAddr(addr: string) {
  const [, col, row] = /^([A-Z]+)(\d+)$/.exec(addr)!;
  return { col, row: Number(row) };
}
