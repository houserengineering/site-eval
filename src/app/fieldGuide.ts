// One field guide for the grey examples on every text and number field and for the demo's answer
// key (demo spec 2026-10-03, decision 4). The examples are the 0271 job's, the same job as the demo's
// answer key (DEMO_KEY), so a placeholder never shows a made-up value (Nathan, 2026-10-04).

export interface GuideEntry {
  /** Grey placeholder shown while the field is empty. */
  example: string;
}

/** By field label, as the screens pass it. */
export const FIELD_GUIDE: Record<string, GuideEntry> = {
  // Site evaluation header
  'Project #': { example: '0271.001' },
  'Project name': { example: 'Stillwater Subdivision' },
  Location: { example: '6133 Bigelow Road, Bozeman MT 59718' },
  'Evaluated by': { example: 'Justin Houser' },
  'Confirmation number': { example: 'SE CONFIRM 00278' },
  'Owner name': { example: 'BC Bigelow LLC' },
  'New test pit #': { example: '1' },
  'New perc test #': { example: '1' },
  // Test pit wall
  'Test pit #': { example: '1A' },
  Top: { example: '0' },
  Bottom: { example: '12' },
  'Color as typed': { example: '10YR 3/2' },
  'Rock fragments (by volume)': { example: '10' },
  'Structure as typed': { example: 'WEAK FINE GRANULAR' },
  Notes: { example: 'FEW FINE ROOTS' },
  'Total depth': { example: '96' },
  'Water depth': { example: '60' },
  'Depth to limiting layer': { example: '48' },
  'Limiting layer description': { example: 'CEMENTED HARDPAN' },
  Slope: { example: '2' },
  'Test pit notes': { example: 'DUG WITH BACKHOE' },
  // Perc tests
  'Perc test #': { example: '1' },
  Lot: { example: '3' },
  'Hole diameter': { example: '6' },
  'Hole depth': { example: '24' },
  'Reference point above hole bottom': { example: '30' },
  'Tester (printed name)': { example: 'Justin Houser' },
  'Fixed drop': { example: '1' },
  'Reading interval': { example: '30' },
  'Perc test notes': { example: 'PRESOAKED OVERNIGHT' },
  'Initial distance below reference point': { example: '12' },
  'Final distance below reference point': { example: '13' },
  'Printed name': { example: 'Justin Houser' },
  Company: { example: 'Houser Engineering' },
  // Groundwater monitoring
  'New observation well #': { example: '1' },
  'Observation well #': { example: '1' },
  'Monitored by': { example: 'Justin Houser' },
  'Section, township, range': { example: 'S35, T2S, R5E' },
  'Lot #': { example: '3' },
  'Other location info': { example: 'NE corner of lot 3' },
  'Stick-up as installed (B)': { example: '24' },
  Date: { example: '2026-05-01' },
  'A: total depth measured': { example: '120' },
  'A: top of pipe to water': { example: '84' },
  'B: top of pipe to ground': { example: '24' },
  'Read by': { example: 'Justin Houser' },
  // Dropbox
  'Your name': { example: 'Justin' },
  'Access token': { example: 'Paste the token from the office' },
  'Go to folder': { example: '/Server/0271/001' },
};

export const placeholderFor = (label: string) => FIELD_GUIDE[label]?.example ?? '';

export interface DemoHorizon {
  designation: string;
  topIn: number;
  bottomIn: number;
  color: { hue: string; value: string; chroma: string };
  texture: string;
  rockPct: number;
  /** Rock size: the demo picks it whenever there is rock (the soil log needs it from 15% up). */
  rockKind?: string;
  structure: { shape: string; grade: string; size: string };
  consistence: string;
  plasticity: string;
  roots: 'Y' | 'N';
  mottling: 'Y' | 'N';
}

/**
 * The demo's answer key: a real Houser job so the practice run looks like the real thing (Nathan,
 * 2026-10-04). 0271.001 Stillwater Subdivision, evaluated by Justin Houser; the horizons are from its
 * test pit 1 logs (O from pit 1B, B from the same pits). Tips show these values; any valid entry is
 * accepted.
 */
export const DEMO_KEY = {
  header: {
    projectNumber: '0271.001',
    projectName: 'Stillwater Subdivision',
    location: '6133 Bigelow Road, Bozeman MT 59718',
    evalBy: 'Justin Houser',
    confirmationNumber: 'SE CONFIRM 00278',
  },
  pit: '1',
  horizons: [
    {
      designation: 'O',
      topIn: 0,
      bottomIn: 12,
      color: { hue: '10YR', value: '3', chroma: '2' },
      texture: 'CLAY LOAM',
      rockPct: 10,
      rockKind: 'GRAVEL',
      structure: { shape: 'BLOCKY', grade: 'MODERATE', size: 'FINE' },
      consistence: 'FRIABLE',
      plasticity: 'SLIGHTLY PLASTIC',
      roots: 'Y',
      mottling: 'N',
    },
    {
      designation: 'B',
      topIn: 12,
      bottomIn: 96,
      color: { hue: '10YR', value: '5', chroma: '3' },
      texture: 'SILT LOAM',
      rockPct: 40,
      rockKind: 'GRAVEL',
      structure: { shape: 'MASSIVE', grade: '', size: '' },
      consistence: 'FRIABLE',
      plasticity: 'SLIGHTLY PLASTIC',
      roots: 'N',
      mottling: 'N',
    },
  ] as DemoHorizon[],
  /** Test pit 1's fix on the job, for "Show me" when there is no GPS indoors. */
  fix: { lat: 45.61352, lon: -111.07212, accuracyM: 2.5 },
};
