// One field guide for the grey examples on every text and number field and for the demo's answer
// key (demo spec 2026-10-03, decision 4). Examples are made up; nothing here is client data.

export interface GuideEntry {
  /** Grey placeholder shown while the field is empty. */
  example: string;
}

/** By field label, as the screens pass it. */
export const FIELD_GUIDE: Record<string, GuideEntry> = {
  // Site evaluation header
  'Project #': { example: '0279.001' },
  'Project name': { example: 'Smith Minor Subdivision' },
  Location: { example: '1234 Example Road, Belgrade' },
  'Eval. by': { example: 'J. Smith' },
  'Confirmation number': { example: 'SE CONFIRM 00123' },
  'Owner name': { example: 'John and Jane Smith' },
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
  'Tester (printed name)': { example: 'J. Smith' },
  'Fixed drop': { example: '1' },
  'Reading interval': { example: '30' },
  'Perc test notes': { example: 'PRESOAKED OVERNIGHT' },
  'Initial distance below reference point': { example: '12' },
  'Final distance below reference point': { example: '13' },
  'Printed name': { example: 'J. Smith, PE' },
  Company: { example: 'Houser Engineering' },
  // Groundwater monitoring
  'New observation well #': { example: '1' },
  'Observation well #': { example: '1' },
  'Monitored by': { example: 'J. Smith' },
  'Section, township, range': { example: 'S12, T1S, R5E' },
  'Lot #': { example: '3' },
  'Other location info': { example: 'NE corner of lot 3' },
  'Stick-up as installed (B)': { example: '24' },
  Date: { example: '2026-05-01' },
  'A: total depth measured': { example: '120' },
  'A: top of pipe to water': { example: '84' },
  'B: top of pipe to ground': { example: '24' },
  'Read by': { example: 'J. Smith' },
  // Dropbox
  'Your name': { example: 'Justin' },
  'Access token': { example: 'Paste the token from the office' },
  'Go to folder': { example: '/Server/0279/001' },
};

export const placeholderFor = (label: string) => FIELD_GUIDE[label]?.example ?? '';

export interface DemoHorizon {
  designation: string;
  topIn: number;
  bottomIn: number;
  color: { hue: string; value: string; chroma: string };
  texture: string;
  rockPct: number;
  structure: { shape: string; grade: string; size: string };
  consistence: string;
  plasticity: string;
  roots: 'Y' | 'N';
  mottling: 'Y' | 'N';
}

/** The demo's made-up job. Tips show these values; any valid entry is accepted. */
export const DEMO_KEY = {
  header: {
    projectNumber: '0999.001',
    projectName: 'Demo Ranch Minor Subdivision',
    location: '1 Sample Road, Belgrade',
    evalBy: 'Your name',
    confirmationNumber: 'SE CONFIRM 00999',
  },
  pit: '1',
  horizons: [
    {
      designation: 'A',
      topIn: 0,
      bottomIn: 12,
      color: { hue: '10YR', value: '3', chroma: '2' },
      texture: 'LOAM',
      rockPct: 5,
      structure: { shape: 'GRANULAR', grade: 'WEAK', size: 'FINE' },
      consistence: 'FRIABLE',
      plasticity: 'SLIGHTLY PLASTIC',
      roots: 'Y',
      mottling: 'N',
    },
    {
      designation: 'B',
      topIn: 12,
      bottomIn: 96,
      color: { hue: '10YR', value: '5', chroma: '4' },
      texture: 'SANDY LOAM',
      rockPct: 10,
      structure: { shape: 'SUBANGULAR BLOCKY', grade: 'WEAK', size: 'MEDIUM' },
      consistence: 'FRIABLE',
      plasticity: 'NON-PLASTIC',
      roots: 'N',
      mottling: 'N',
    },
  ] as DemoHorizon[],
  /** Made-up fix for "Show me" when there is no GPS indoors. */
  fix: { lat: 45.7769, lon: -111.1772, accuracyM: 1.5 },
};
