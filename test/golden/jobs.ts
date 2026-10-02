// Golden jobs: recent Houser Gallatin County soil logs re-entered as field records.
// Only the soil descriptions are kept; project, owner and location are removed so the
// public repo holds no client data. `historical` is the submitted cell text (8 columns:
// HORIZON, DEPTH, COLOR, TEXTURE, STRUCTURE, ROOTS, MOTTLING, NOTES); `expected` is what
// the generator must write; every cell that differs (ignoring case and spacing) needs a reason.
import { emptyHorizon, type Horizon, type Munsell } from '../../src/domain/fieldRecord';

type HorizonInput = Partial<Omit<Horizon, 'id'>>;
export interface GoldenPit {
  label: string;
  horizons: HorizonInput[];
  historical: string[][];
  expected: string[][];
  /** Key `row,col` (0-based) → why the generated cell differs from the submitted one. */
  reasons: Record<string, string>;
}
export interface GoldenJob {
  id: string;
  description: string;
  pits: GoldenPit[];
}

const color = (m: Munsell & { name?: string }) => ({ ...m, moisture: 'MOIST', physicalState: 'RUBBED', other: '' });
const structure = (p: Partial<Horizon['structure']>) => ({ ...emptyHorizon().structure, ...p });
const mottlingNo = { ...emptyHorizon().mottling, present: 'N' as const };

const R = {
  depth: 'House depth format is `0"-12"` with inch marks on both numbers (2,123 of 2,209 historical rows, research/01 §1.3).',
  colorWords: '2026 template color wording: Munsell, looked-up chart name, MOIST, RUBBED (research/01 §1.5); name comes from the Munsell lookup instead of being typed.',
  stiff: '"Stiff" is consistence, not a structure grade (DEQ-4 App. B); re-entered as consistence FIRM, which prints in NOTES.',
  structurePunct: 'Grade, then size + shape: "WEAK, FINE GRANULAR" (DEQ-4 App. B order; same words).',
  sizeRange: 'Size ranges print as "FINE TO MEDIUM", the most common historical form (449 rows, research/01 §1.7).',
  zero: 'Horizon O typed as zero in the source; the app stores the letter O (75 historical rows had this error, research/01 §1.4).',
  yesNo: 'ROOTS/MOTTLING print as Y/N, the 2026 template convention.',
  gravelly: 'DEQ-4 App. B: 15–35% gravel takes the GRAVELLY modifier; the source wrote 30% gravel in NOTES but left the texture unmodified.',
  rockCase: 'Office NOTES wording in caps ("30% GRAVEL").',
  firmNote: 'Consistence (DEQ-4 §2.1.4.1.B) prints first in NOTES; free notes follow unchanged.',
};

export const GOLDEN_JOBS: GoldenJob[] = [
  {
    id: 'A',
    description: 'Gallatin County residence, evaluated 2025-05-15; septic permit approved 2026-07-02 (newest approved Houser Gallatin soil log, research/03 §6.A). Classic multi-pit layout, 2 pits × 2 horizons.',
    pits: [
      ...[
        { label: '1', bottomA: 22, bottomB: 101 },
        { label: '2', bottomA: 20, bottomB: 99 },
      ].map(({ label, bottomA, bottomB }) => ({
        label,
        horizons: [
          {
            designation: 'A', topIn: 0, bottomIn: bottomA, color: color({ hue: '10YR', value: '2', chroma: '2' }),
            texture: { cls: 'CLAY LOAM', sandSize: '' }, structure: structure({ shape: 'GRANULAR' }), consistence: 'FIRM',
            roots: 'Y', mottling: mottlingNo, notes: 'Moist topsoil w/ organics',
          },
          {
            designation: 'B', bottomIn: bottomB, color: color({ hue: '10YR', value: '5', chroma: '6' }),
            texture: { cls: 'SILTY CLAY LOAM', sandSize: '' }, structure: structure({ grade: 'WEAK', size: 'FINE', shape: 'GRANULAR' }),
            rock: { pct: 0, kind: 'ROCKS' }, roots: 'N', mottling: mottlingNo,
          },
        ] satisfies HorizonInput[],
        historical: [
          ['A', `0-${bottomA}"`, '10YR 2/2', 'Clay loam', 'Stiff, granular', 'Y', 'N', 'Moist topsoil w/ organics'],
          ['B', `${bottomA}"-${bottomB}"`, '10YR 5/6', 'Silty Clay Loam', 'Weak, fine, granular', 'N', 'N', 'No rocks'],
        ],
        expected: [
          ['A', `0"-${bottomA}"`, '10YR 2/2, VERY DARK BROWN, MOIST, RUBBED', 'CLAY LOAM', 'GRANULAR', 'Y', 'N', 'FIRM, MOIST TOPSOIL W/ ORGANICS'],
          ['B', `${bottomA}"-${bottomB}"`, '10YR 5/6, YELLOWISH BROWN, MOIST, RUBBED', 'SILTY CLAY LOAM', 'WEAK, FINE GRANULAR', 'N', 'N', 'NO ROCKS'],
        ],
        reasons: {
          '0,1': R.depth, '0,2': R.colorWords, '0,4': R.stiff, '0,7': R.firmNote,
          '1,2': R.colorWords, '1,4': R.structurePunct,
        },
      })),
    ],
  },
  {
    id: 'B',
    description: 'Gallatin County septic system, evaluated 2026-09-18 (newest in-progress Houser Gallatin soil log, research/03 §6.B). Classic layout; source labels both pits "1" and ends them at 56" with no limiting layer recorded (flagged in research/03).',
    pits: [
      ...[
        { label: '1', b1: 20, b2: 46 },
        { label: '2', b1: 16, b2: 44 },
      ].map(({ label, b1, b2 }) => ({
        label,
        horizons: [
          {
            designation: 'O', topIn: 0, bottomIn: b1, color: color({ hue: '7.5YR', value: '2.5', chroma: '1' }),
            texture: { cls: 'CLAY LOAM', sandSize: '' }, structure: structure({ size: 'FINE', size2: 'MEDIUM', shape: 'GRANULAR' }),
            roots: 'Y', mottling: mottlingNo,
          },
          {
            designation: 'A', bottomIn: b2, color: color({ hue: '10YR', value: '4', chroma: '3' }),
            texture: { cls: 'LOAM', sandSize: '' }, rock: { pct: 30, kind: 'GRAVEL' }, structure: structure({ size: 'MEDIUM', shape: 'GRANULAR' }),
            roots: 'Y', mottling: mottlingNo,
          },
          {
            designation: 'B', bottomIn: 56, color: color({ hue: '10YR', value: '4', chroma: '3' }),
            texture: { cls: 'LOAM', sandSize: '' }, rock: { pct: 30, kind: 'GRAVEL' }, structure: structure({ size: 'FINE', size2: 'MEDIUM', shape: 'GRANULAR' }),
            roots: 'Y', mottling: mottlingNo,
          },
        ] satisfies HorizonInput[],
        historical: [
          ['0', `0"-${b1}"`, 'Black, 7.5 YR2.5/1, moist, rubbed', 'Clay Loam', 'Fine-Medium Granular', 'Yes', 'No', ''],
          ['A', `${b1}"-${b2}"`, 'Brown, 10YR4/3, moist, rubbed', 'Gravelly Loam', 'Medium Granular', 'Yes', 'No', '30% gravel'],
          ['B', `${b2}"-56"`, 'Brown, 10YR4/3, moist, rubbed', 'Loam', 'Fine-Medium Granular', 'Yes', 'No', '30% gravel'],
        ],
        expected: [
          ['O', `0"-${b1}"`, '7.5YR 2.5/1, BLACK, MOIST, RUBBED', 'CLAY LOAM', 'FINE TO MEDIUM GRANULAR', 'Y', 'N', ''],
          ['A', `${b1}"-${b2}"`, '10YR 4/3, BROWN, MOIST, RUBBED', 'GRAVELLY LOAM', 'MEDIUM GRANULAR', 'Y', 'N', '30% GRAVEL'],
          ['B', `${b2}"-56"`, '10YR 4/3, BROWN, MOIST, RUBBED', 'GRAVELLY LOAM', 'FINE TO MEDIUM GRANULAR', 'Y', 'N', '30% GRAVEL'],
        ],
        reasons: {
          '0,0': R.zero, '0,2': R.colorWords, '0,4': R.sizeRange, '0,5': R.yesNo, '0,6': R.yesNo,
          '1,2': R.colorWords, '1,5': R.yesNo, '1,6': R.yesNo,
          '2,2': R.colorWords, '2,3': R.gravelly, '2,4': R.sizeRange, '2,5': R.yesNo, '2,6': R.yesNo,
        },
      })),
    ],
  },
  {
    id: 'C',
    description: 'Sample pit typed by the PE into the 2026 office Soil Log Template on 2026-10-01 (newest house wording, research/01 §2.1). One pit × 3 horizons.',
    pits: [
      {
        label: '1',
        horizons: [
          {
            designation: 'O', topIn: 0, bottomIn: 12, color: color({ hue: '2.5Y', value: '3', chroma: '2' }),
            texture: { cls: 'SILT LOAM', sandSize: '' }, rock: { pct: 1, kind: 'ROCKS' }, structure: structure({ size: 'VERY FINE', shape: 'GRANULAR' }),
            roots: 'Y', mottling: mottlingNo,
          },
          {
            designation: 'A', bottomIn: 66, color: color({ hue: '2.5Y', value: '3', chroma: '2' }),
            texture: { cls: 'SILT LOAM', sandSize: '' }, rock: { pct: 5, kind: 'ROCKS' }, structure: structure({ size: 'VERY FINE', shape: 'GRANULAR' }),
            roots: 'N', mottling: mottlingNo,
          },
          {
            designation: 'B', bottomIn: 96, color: color({ hue: '2.5Y', value: '4', chroma: '2' }),
            texture: { cls: 'SANDY LOAM', sandSize: '' }, rock: { pct: 40, kind: 'ROCKS' }, structure: structure({ size: 'VERY FINE', shape: 'GRANULAR' }),
            roots: 'N', mottling: mottlingNo,
          },
        ],
        historical: [
          ['O', '0"-12"', '2.5Y 3/2, VERY DARK GRAYISH BROWN, MOIST, RUBBED', 'SILT LOAM', 'VERY FINE GRANULAR', 'Y', 'N', '1% ROCKS'],
          ['A', '12"-66"', '2.5Y 3/2, VERY DARK GRAYISH BROWN, MOIST, RUBBED', 'SILT LOAM', 'VERY FINE GRANULAR', 'N', 'N', '5% ROCKS'],
          ['B', '66"-96"', '2.5Y 4/2, DARK GRAYISH BROWN, MOIST, RUBBED', 'SANDY LOAM', 'VERY FINE GRANULAR', 'N', 'N', '40% ROCKS'],
        ],
        expected: [
          ['O', '0"-12"', '2.5Y 3/2, VERY DARK GRAYISH BROWN, MOIST, RUBBED', 'SILT LOAM', 'VERY FINE GRANULAR', 'Y', 'N', '1% ROCKS'],
          ['A', '12"-66"', '2.5Y 3/2, VERY DARK GRAYISH BROWN, MOIST, RUBBED', 'SILT LOAM', 'VERY FINE GRANULAR', 'N', 'N', '5% ROCKS'],
          ['B', '66"-96"', '2.5Y 4/2, DARK GRAYISH BROWN, MOIST, RUBBED', 'SANDY LOAM', 'VERY FINE GRANULAR', 'N', 'N', '40% ROCKS'],
        ],
        reasons: {},
      },
    ],
  },
];
