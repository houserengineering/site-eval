// Controlled vocabulary for soil descriptions: DEQ-4 Appendix B (USDA) terms plus the
// wording Houser's soil logs already use (research/01 §6). Every pick list also allows
// free text in the UI, so these lists guide rather than restrict.

export const HORIZONS = ['O', 'A', 'AB', 'BA', 'E', 'B', 'Bw', 'Bt', 'Bk', 'BC', 'C', 'Ck', 'R'] as const;

// ---- Munsell color ------------------------------------------------------------

export const HUES = ['10R', '2.5YR', '5YR', '7.5YR', '10YR', '2.5Y', '5Y'] as const;
/** Gley pages: GLEY 1 (N, Y, GY, G hues) and GLEY 2 (BG, B, PB hues). */
export const GLEY_HUES = ['N', '10Y', '5GY', '10GY', '5G', '10G', '5BG', '10BG', '5B', '10B', '5PB'] as const;
export const VALUES = ['2', '2.5', '3', '4', '5', '6', '7', '8'] as const;
export const CHROMAS = ['1', '2', '3', '4', '6', '8'] as const;
export const MOISTURE = ['MOIST', 'DRY', 'WET'] as const;
export const PHYSICAL_STATE = ['RUBBED', 'BROKEN', 'CRUSHED'] as const;

// Munsell Soil Color Book names, one string per value row, chroma 1/2/3/4/6/8 separated by "|".
// An empty slot means no chip at that position on the chart page.
const PAGES: Record<string, Record<string, string>> = {
  '10R': {
    '2.5': 'reddish black|very dusky red||||',
    '3': 'dark reddish gray|dusky red|dusky red|dusky red|dark red|',
    '4': 'dark reddish gray|weak red|weak red|weak red|red|red',
    '5': 'reddish gray|weak red|weak red|weak red|red|red',
    '6': 'reddish gray|pale red|pale red|pale red|light red|light red',
    '7': 'light reddish gray|pale red|pale red|pale red|light red|light red',
    '8': 'white|pinkish white|pink|pink||',
  },
  '2.5YR': {
    '2.5': 'reddish black|very dusky red|dark reddish brown|dark reddish brown||',
    '3': 'dark reddish gray|dusky red|dark reddish brown|dark reddish brown|dark red|',
    '4': 'dark reddish gray|weak red|reddish brown|reddish brown|red|red',
    '5': 'reddish gray|weak red|reddish brown|reddish brown|red|red',
    '6': 'reddish gray|pale red|light reddish brown|light reddish brown|light red|light red',
    '7': 'light reddish gray|pale red|pale red|light reddish brown|light red|light red',
    '8': 'white|pinkish white|pink|pink||',
  },
  '5YR': {
    '2.5': 'black|dark reddish brown||||',
    '3': 'very dark gray|dark reddish brown|dark reddish brown|dark reddish brown||',
    '4': 'dark gray|dark reddish gray|reddish brown|reddish brown|yellowish red|',
    '5': 'gray|reddish gray|reddish brown|reddish brown|yellowish red|yellowish red',
    '6': 'gray|pinkish gray|light reddish brown|light reddish brown|reddish yellow|reddish yellow',
    '7': 'light gray|pinkish gray|pink|pink|reddish yellow|reddish yellow',
    '8': 'white|pinkish white|pink|pink||',
  },
  '7.5YR': {
    '2.5': 'black|very dark brown|very dark brown|||',
    '3': 'very dark gray|dark brown|dark brown|dark brown||',
    '4': 'dark gray|brown|brown|brown|strong brown|',
    '5': 'gray|brown|brown|brown|strong brown|strong brown',
    '6': 'gray|pinkish gray|light brown|light brown|reddish yellow|reddish yellow',
    '7': 'light gray|pinkish gray|pink|pink|reddish yellow|reddish yellow',
    '8': 'white|pinkish white|pink|pink|reddish yellow|',
  },
  '10YR': {
    '2': 'black|very dark brown||||',
    '2.5': 'black|very dark brown||||',
    '3': 'very dark gray|very dark grayish brown|dark brown|dark yellowish brown|dark yellowish brown|',
    '4': 'dark gray|dark grayish brown|brown|dark yellowish brown|dark yellowish brown|',
    '5': 'gray|grayish brown|brown|yellowish brown|yellowish brown|yellowish brown',
    '6': 'gray|light brownish gray|pale brown|light yellowish brown|brownish yellow|brownish yellow',
    '7': 'light gray|light gray|very pale brown|very pale brown|yellow|yellow',
    '8': 'white|very pale brown|very pale brown|very pale brown|yellow|yellow',
  },
  '2.5Y': {
    '2.5': 'black|black||||',
    '3': 'very dark gray|very dark grayish brown|dark olive brown|||',
    '4': 'dark gray|dark grayish brown|olive brown|olive brown||',
    '5': 'gray|grayish brown|light olive brown|light olive brown|light olive brown|',
    '6': 'gray|light brownish gray|light yellowish brown|light yellowish brown|olive yellow|olive yellow',
    '7': 'light gray|light gray|pale yellow|pale yellow|yellow|yellow',
    '8': 'white|pale yellow|pale yellow|pale yellow|yellow|yellow',
  },
  '5Y': {
    '2.5': 'black|black||||',
    '3': 'very dark gray|dark olive gray||||',
    '4': 'dark gray|olive gray|olive|olive||',
    '5': 'gray|olive gray|olive|olive|olive|',
    '6': 'gray|light olive gray|pale olive|pale olive|olive yellow|olive yellow',
    '7': 'light gray|light gray|pale yellow|pale yellow|yellow|yellow',
    '8': 'white|pale yellow|pale yellow|pale yellow|yellow|yellow',
  },
};

const NEUTRAL: Record<string, string> = {
  '2': 'black', '2.5': 'black', '3': 'very dark gray', '4': 'dark gray', '5': 'gray', '6': 'gray', '7': 'light gray', '8': 'white',
};
const GLEY_CHROMA1: Record<string, [string, string]> = {
  // value → [greenish name, bluish name]
  '2.5': ['greenish black', 'bluish black'],
  '3': ['very dark greenish gray', 'very dark bluish gray'],
  '4': ['dark greenish gray', 'dark bluish gray'],
  '5': ['greenish gray', 'bluish gray'],
  '6': ['greenish gray', 'bluish gray'],
  '7': ['light greenish gray', 'light bluish gray'],
  '8': ['light greenish gray', 'light bluish gray'],
};

/** Upper-case Munsell color name, or '' when the chip is not on the chart. */
export function munsellName(hue: string, value: string, chroma: string): string {
  if (hue === 'N') return (NEUTRAL[value] ?? '').toUpperCase();
  if ((GLEY_HUES as readonly string[]).includes(hue)) {
    if (chroma !== '1') return '';
    const pair = GLEY_CHROMA1[value];
    return pair ? pair[/B/.test(hue) ? 1 : 0].toUpperCase() : '';
  }
  const row = PAGES[hue]?.[value];
  if (!row) return '';
  const i = (CHROMAS as readonly string[]).indexOf(chroma);
  return i < 0 ? '' : (row.split('|')[i] ?? '').toUpperCase();
}

/** `10YR 3/2`; neutral `N 5/`. */
export function munsellNotation(hue: string, value: string, chroma: string): string {
  if (!hue || !value) return '';
  if (hue === 'N') return `N ${value}/`;
  return chroma ? `${hue} ${value}/${chroma}` : '';
}

/** Chromas that exist on the chart for a hue and value (the picker greys out the rest). */
export function chromasFor(hue: string, value: string): string[] {
  if (hue === 'N') return [];
  return CHROMAS.filter((c) => munsellName(hue, value, c) !== '');
}

// ---- Texture (DEQ-4 Appendix B / USDA) ---------------------------------------

export const TEXTURES = [
  'SAND', 'LOAMY SAND', 'SANDY LOAM', 'LOAM', 'SILT LOAM', 'SILT',
  'SANDY CLAY LOAM', 'CLAY LOAM', 'SILTY CLAY LOAM', 'SANDY CLAY', 'SILTY CLAY', 'CLAY',
] as const;
/** Sand-size modifiers apply only to the sandy classes. */
export const SAND_SIZES = ['VERY FINE', 'FINE', 'MEDIUM', 'COARSE', 'VERY COARSE'] as const;
export const SANDY_TEXTURES = ['SAND', 'LOAMY SAND', 'SANDY LOAM'];

export function textureWithSandSize(cls: string, sandSize: string): string {
  if (!sandSize || !SANDY_TEXTURES.includes(cls)) return cls;
  if (cls === 'SAND') return `${sandSize} SAND`;
  if (cls === 'LOAMY SAND') return `LOAMY ${sandSize} SAND`;
  return `${sandSize} SANDY LOAM`;
}

/** Rock fragment kinds by size class (DEQ-4 Table B-1). ROCKS = not yet classed by size. */
export const ROCK_KINDS = ['ROCKS', 'GRAVEL', 'COBBLES', 'STONES', 'BOULDERS', 'CHANNERS', 'FLAGSTONES'] as const;
const ROCK_ADJECTIVE: Record<string, string> = {
  GRAVEL: 'GRAVELLY', COBBLES: 'COBBLY', STONES: 'STONY', BOULDERS: 'BOULDERY', CHANNERS: 'CHANNERY', FLAGSTONES: 'FLAGGY',
};
export const ROCK_KIND_HELP: Record<string, string> = {
  ROCKS: 'size not classed',
  GRAVEL: '2–75 mm',
  COBBLES: '75–250 mm',
  STONES: '250–600 mm',
  BOULDERS: '>600 mm',
  CHANNERS: 'flat, 2–150 mm',
  FLAGSTONES: 'flat, 150–380 mm',
};

/** Rock size families, smallest first: a size range runs within one family. */
const ROCK_FAMILIES = [['GRAVEL', 'COBBLES', 'STONES', 'BOULDERS'], ['CHANNERS', 'FLAGSTONES']];

/** Sizes a range starting at `kind` can run to ("GRAVEL TO COBBLES"). */
export function rockRangeTo(kind: string): string[] {
  const family = ROCK_FAMILIES.find((f) => f.includes(kind));
  return family ? family.slice(family.indexOf(kind) + 1) : [];
}

/** 60% or more rock by volume is bedrock, not a soil horizon (Justin, 2026-10-02). */
export function rockPctProblem(pct: number | null): string | undefined {
  return pct != null && pct >= 60 ? '60% or more is bedrock, not a test pit horizon' : undefined;
}

/**
 * DEQ-4 Appendix B rock-fragment texture modifier from percent by volume:
 * <15 none; 15–<35 GRAVELLY; 35–<60 VERY GRAVELLY; 60–<90 EXTREMELY GRAVELLY;
 * ≥90 the fragment noun replaces the texture (GRAVEL). Unclassed ROCKS get no modifier.
 */
export function rockModifier(pct: number | null, kind: string): { prefix: string; noun?: string } {
  const adj = ROCK_ADJECTIVE[kind];
  if (pct == null || !adj || pct < 15) return { prefix: '' };
  if (pct < 35) return { prefix: adj };
  if (pct < 60) return { prefix: `VERY ${adj}` };
  if (pct < 90) return { prefix: `EXTREMELY ${adj}` };
  return { prefix: '', noun: kind };
}

// ---- Structure ------------------------------------------------------------------

export const STRUCTURE_GRADES = ['WEAK', 'MODERATE', 'STRONG'] as const;
export const STRUCTURE_SIZES = ['VERY FINE', 'FINE', 'MEDIUM', 'COARSE', 'VERY COARSE'] as const;
export const STRUCTURE_SHAPES = [
  'GRANULAR', 'BLOCKY', 'SUBANGULAR BLOCKY', 'ANGULAR BLOCKY', 'PLATY', 'PRISMATIC', 'COLUMNAR', 'SINGLE GRAIN', 'MASSIVE',
] as const;
/** Structureless shapes take no grade or size. */
export const STRUCTURELESS = ['SINGLE GRAIN', 'MASSIVE'];

// ---- Consistence, plasticity, mottles ------------------------------------------

export const CONSISTENCE = [
  'LOOSE', 'VERY FRIABLE', 'FRIABLE', 'FIRM', 'VERY FIRM', 'EXTREMELY FIRM', 'SOFT', 'SLIGHTLY HARD', 'HARD', 'VERY HARD',
] as const;
export const PLASTICITY = ['NON-PLASTIC', 'SLIGHTLY PLASTIC', 'MODERATELY PLASTIC', 'VERY PLASTIC'] as const;
export const MOTTLE_QUANTITY = ['FEW', 'COMMON', 'MANY'] as const;
export const MOTTLE_QUANTITY_HELP: Record<string, string> = { FEW: '<2%', COMMON: '2–20%', MANY: '>20%' };
export const MOTTLE_SIZE = ['FINE', 'MEDIUM', 'COARSE'] as const;
export const MOTTLE_CONTRAST = ['FAINT', 'DISTINCT', 'PROMINENT'] as const;

// ---- Test pit level -------------------------------------------------------------

export const OBSERVED_WATER = [
  { value: 'NONE', label: 'None' },
  { value: 'SEEPAGE', label: 'Seepage' },
  { value: 'STANDING', label: 'Standing water' },
] as const;
export const SHGW_BASIS = [
  'NO REDOXIMORPHIC FEATURES TO TEST PIT DEPTH',
  'REDOXIMORPHIC FEATURES',
  'OBSERVED WATER',
  'GROUNDWATER MONITORING',
  'NRCS SOIL SURVEY',
] as const;
export const LIMITING_LAYERS = [
  { value: 'NONE', label: 'None within test pit' },
  { value: 'BEDROCK', label: 'Bedrock' },
  { value: 'IMPERVIOUS', label: 'Impervious layer' },
  { value: 'SHGW', label: 'Seasonal high groundwater' },
  { value: 'OTHER', label: 'Other' },
] as const;
export const SLOPE_SHAPES = ['PLANE', 'CONCAVE', 'CONVEX'] as const;
export const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export const SLOPE_METHODS = ['CLINOMETER', 'HAND LEVEL', 'SURVEY', 'TOPO MAP', 'ESTIMATED'] as const;

/** Quick picks for horizon bottoms (research/01 §6). */
export const FIRST_BOTTOMS = [4, 6, 8, 10, 12, 18];
export const PIT_BOTTOMS = [96, 102, 108, 114, 120];
