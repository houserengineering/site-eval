// Golden perc tests: recent Houser perc workbooks re-entered as field records. Only the
// readings are kept (no owner, project or location), so the public repo holds no client data.
// `historical` is each reading row as the submitted workbook computes it:
// [start h:mm, end h:mm, interval min, initial in, final in, drop in, rate mpi].
import type { PercMode } from '../../src/domain/fieldRecord';

export type HistoricalRow = [string, string, number, number, number, number, number];
export interface GoldenPercTest {
  id: string;
  description: string;
  date: string;
  mode: PercMode;
  holeDiameterIn: number;
  referenceHeightIn: number;
  intervalMin: number;
  /** Historical times are afternoon but were typed without AM/PM. */
  pm?: boolean;
  historical: HistoricalRow[];
  /** Final rate as submitted/cited. */
  finalRateMpi: number;
  /** Column (0-based) → why the generated values differ from the submitted ones. */
  reasons: Record<number, string>;
}

export const GOLDEN_PERC: GoldenPercTest[] = [
  {
    id: 'B-1',
    description:
      'Gallatin County residence, perc test #1, 2026-06-09 (`0104.019 12 Percolation Tests.xlsx`, P1-Δ layout; GCCHD RFI submittal; design report cites 46 mpi). Hole refilled before each 20-min reading.',
    date: '2026-06-09',
    mode: 'standard',
    holeDiameterIn: 6,
    referenceHeightIn: 25,
    intervalMin: 20,
    historical: [
      ['10:40', '11:00', 20, 18.9375, 19.5, 0.5625, 35.56],
      ['11:00', '11:20', 20, 19, 19.4375, 0.4375, 45.71],
      ['11:20', '11:40', 20, 18.875, 19.375, 0.5, 40],
      ['11:40', '12:00', 20, 19.0625, 19.5, 0.4375, 45.71],
      ['12:00', '12:20', 20, 19.0625, 19.5, 0.4375, 45.71],
    ],
    finalRateMpi: 45.71,
    reasons: {},
  },
  {
    id: 'B-2',
    description: 'Same job, perc test #2 (design report cites 40 mpi); 6 readings.',
    date: '2026-06-09',
    mode: 'standard',
    holeDiameterIn: 6,
    referenceHeightIn: 25,
    intervalMin: 20,
    historical: [
      ['10:50:01', '11:10:01', 20, 18.6875, 19.4375, 0.75, 26.67],
      ['11:10:01', '11:30:01', 20, 19.4375, 20, 0.5625, 35.56],
      ['11:30:01', '11:50:01', 20, 19.0625, 19.5625, 0.5, 40],
      ['11:50:01', '12:10:01', 20, 19, 19.375, 0.375, 53.33],
      ['12:10:01', '12:30:01', 20, 19.125, 19.6875, 0.5625, 35.56],
      ['12:30:01', '12:50:01', 20, 19, 19.5, 0.5, 40],
    ],
    finalRateMpi: 40,
    reasons: {},
  },
  {
    id: 'C',
    description: 'Gallatin County lot, perc test #1, 2026-02-19 (`0265 Perc Test.xlsx`, P1 with JOB header); 15-min readings, continuous water level.',
    date: '2026-02-19',
    mode: 'standard',
    holeDiameterIn: 6,
    referenceHeightIn: 18,
    intervalMin: 15,
    historical: [
      ['09:00', '09:15', 15, 18, 18.5, 0.5, 30],
      ['09:15', '09:30', 15, 18.5, 19, 0.5, 30],
      ['09:30', '09:45', 15, 19, 19.333, 0.333, 45.05],
      ['09:45', '10:00', 15, 19.333, 19.666, 0.333, 45.05],
      ['10:00', '10:15', 15, 19.666, 20, 0.334, 44.91],
      ['10:15', '10:30', 15, 20, 20.333, 0.333, 45.05],
    ],
    finalRateMpi: 45.05,
    reasons: {},
  },
  {
    id: 'D',
    description:
      'Golf course drainfield perc test #3, 2025-10-16 (`0001.138 Percolation Test No. 3.xlsx`); 30-min readings typed as text with hand-typed rates.',
    date: '2025-10-16',
    mode: 'standard',
    holeDiameterIn: 8,
    referenceHeightIn: 26,
    intervalMin: 30,
    pm: true,
    historical: [
      ['2:30', '3:00', 30, 22.125, 23.625, 1.5, 20],
      ['3:00', '3:30', 30, 23.625, 24.375, 0.75, 40],
      ['3:30', '4:00', 30, 24.375, 25.125, 0.75, 40],
      ['4:00', '4:30', 30, 25.125, 25.625, 0.5, 60],
      ['4:30', '5:00', 30, 25.625, 26.0625, 0.4375, 68.6],
    ],
    finalRateMpi: 68.6,
    reasons: {
      0: 'The submitted sheet typed afternoon times as 2:30–5:00 in an h:mm cell (reads as morning). The app stores clock time (14:30) and prints h:mm AM/PM, as research/02 §3 recommends.',
      1: 'Same as start time: 3:00–5:00 PM printed with AM/PM.',
    },
  },
];
