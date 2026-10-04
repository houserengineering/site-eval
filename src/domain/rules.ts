// Rule checks: advisory warnings from the currently governing rules (research/03 §8, as of
// 2026-10-01). Every check is a pure function of the field record and cites its rule; none
// blocks anything, because the reviewing authority and the PE keep the judgment.
import { pitDepth, type Design, type FieldRecord, type Horizon, type PercTest, type TestPit } from './fieldRecord';
import { readingCalc, soakStatus, stopRule } from './perc';
import { wallOf } from './pitWalls';

/** Which review a rule belongs to: DEQ subdivision, county permit, or both (DEQ-4 is adopted by both). */
export type Juris = 'ALL' | 'SUB' | 'CTY';

export interface Rule {
  id: string;
  title: string;
  /** The rule as written (quoted where the source wording is short; otherwise a close paraphrase). */
  text: string;
  source: string;
  section: string;
  effective: string;
  juris: Juris;
}

const DEQ4 = 'DEQ-4 (Dec. 2023 ed.)';
const DEQ4_EFF = 'Dec. 2023 edition (adopted 12/23/2023)';
const HC3 = 'Gallatin City-County Health Code Ch. 3';
const HC3_EFF = '5/23/2025';

/** The rule table. Values: research/03 §8 (governing as of 2026-10-01); research/02 only where 03 confirms unchanged. */
export const RULES = {
  pitDepth: {
    id: 'pit-depth',
    title: 'Test pit depth',
    text: 'Test pits must be at least 8 feet (96 in.) deep unless a limiting layer precludes digging that deep.',
    source: `${DEQ4}; ARM 17.36.914`,
    section: 'DEQ-4 §2.1.4; ARM 17.36.914(5)(a)',
    effective: `${DEQ4_EFF}; 12/23/2023`,
    juris: 'ALL',
  },
  limitingWithin84: {
    id: 'limiting-within-84',
    title: 'Limiting layer within 7 ft',
    text: 'If a limiting layer is believed to be within 7 feet of the surface, additional test pits and soil descriptions are required.',
    source: 'ARM 17.36.325',
    section: 'ARM 17.36.325(3)(d)',
    effective: '8/8/2014',
    juris: 'SUB',
  },
  gwTrigger: {
    id: 'gw-trigger',
    title: 'Groundwater monitoring trigger',
    text: 'If there is reason to believe groundwater will be within 7 feet of the surface at any time of the year within the treatment system, install groundwater observation pipes at least 8 feet deep and monitor through the seasonal high (DEQ-4 App. C).',
    source: 'ARM 17.36.325; ARM 17.36.914',
    section: 'ARM 17.36.325(2); ARM 17.36.914(5)(c)',
    effective: '8/8/2014; 12/23/2023',
    juris: 'ALL',
  },
  separation: {
    id: 'separation',
    title: 'Vertical separation',
    text: 'A minimum of 4 feet (48 in.) of natural soil must exist between the infiltrative surface (or liner) and a limiting layer.',
    source: 'ARM 17.36.320; ARM 17.36.914',
    section: 'ARM 17.36.320(4); ARM 17.36.914(3)',
    effective: '4/15/2023; 12/23/2023',
    juris: 'ALL',
  },
  steepSeparation: {
    id: 'steep-separation',
    title: 'Vertical separation on steep slopes',
    text: 'On slopes greater than 15 percent, at least 6 feet (72 in.) of natural soil must exist between the infiltrative surface and a limiting layer.',
    source: 'ARM 17.36.320',
    section: 'ARM 17.36.320(4)(a)',
    effective: '4/15/2023',
    juris: 'SUB',
  },
  slopeLimit: {
    id: 'slope-limit',
    title: 'Slope limits',
    text: 'Gravity systems may not be placed on slopes over 15 percent. Pressure-dosed systems up to 5,000 gpd may be placed on 15–25 percent slopes with evidence that effluent will not surface downslope. 25–35 percent: pressure-dosed by waiver only, after consultation with the local health department.',
    source: 'ARM 17.36.322',
    section: 'ARM 17.36.322(1)–(2)',
    effective: '4/15/2023',
    juris: 'SUB',
  },
  slopeContours: {
    id: 'slope-contours',
    title: 'Slope reporting over 15 %',
    text: 'Report slope type, percent, direction and method. The reviewing authority may require a 2-ft contour map where slopes exceed 15 percent within 25 ft of the absorption or replacement area.',
    source: DEQ4,
    section: 'DEQ-4 §2.1.8.1',
    effective: DEQ4_EFF,
    juris: 'ALL',
  },
  steepSetback: {
    id: 'steep-setback',
    title: 'Setback to slopes over 35 %',
    text: 'Slopes greater than 35 percent (down-gradient): setback 10 ft from components, 25 ft from drainfields.',
    source: 'ARM 17.36.323 Table 2; ARM 17.36.918 Table 1',
    section: 'ARM 17.36.323 Table 2; ARM 17.36.918 Table 1',
    effective: '12/23/2023',
    juris: 'ALL',
  },
  systemSlope: {
    id: 'system-slope',
    title: 'System slope limits',
    text: 'At-grade: slope ≤ 6 % and perc ≤ 40 mpi. Elevated sand mound: ≤ 12 % (basal rate 0.4–0.8 gpd/ft²) or ≤ 6 % (0.2–0.3). ETA/ET: ≤ 15 %.',
    source: DEQ4,
    section: 'DEQ-4 §6.3, §6.7, §6.8',
    effective: DEQ4_EFF,
    juris: 'ALL',
  },
  percRequired: {
    id: 'perc-required',
    title: 'Perc test required (Gallatin)',
    text: 'A percolation test is required when any horizon at the infiltrative depth has an application rate of 0.4 gpd/ft² or less. Silt loam and very fine sand may use a particle-size analysis instead if clay is under 20 %.',
    source: HC3,
    section: 'HC-3 §3.8',
    effective: HC3_EFF,
    juris: 'CTY',
  },
  pressureRequired: {
    id: 'pressure-required',
    title: 'Pressure distribution (Gallatin)',
    text: 'Systems in soils with percolation rates faster than 10 mpi or application rates of 0.6 gpd/ft² or more must be pressure distributed.',
    source: HC3,
    section: 'HC-3 §4.4',
    effective: HC3_EFF,
    juris: 'CTY',
  },
  coarseSoil: {
    id: 'coarse-soil',
    title: 'Gravel and coarse sands',
    text: 'Systems in gravel or coarser soils with perc rates faster than 3 mpi must be pressure dosed and sand lined. Loamy sand and coarse sand: pressure distribution if less than 6 ft from trench bottom to a limiting layer.',
    source: DEQ4,
    section: 'DEQ-4 Table 2.1-1 fn c, d',
    effective: DEQ4_EFF,
    juris: 'ALL',
  },
  location: {
    id: 'location',
    title: 'Location of every pit, perc test and well',
    text: 'Record the location of every test pit, percolation test and groundwater monitoring location in decimal-degree latitude/longitude, accurate to ±10 ft.',
    source: HC3,
    section: 'HC-3 §3.4',
    effective: HC3_EFF,
    juris: 'CTY',
  },
  pitCount: {
    id: 'pit-count',
    title: 'Number of test pits',
    text: 'At least one test pit per individual or shared drainfield, at least three per multiple-user or public drainfield, and at least one in each zone of a pressure-dosed drainfield.',
    source: 'ARM 17.36.325',
    section: 'ARM 17.36.325(3)(c)',
    effective: '8/8/2014',
    juris: 'SUB',
  },
  pitDistance: {
    id: 'pit-distance',
    title: 'Pit within 25 ft of drainfield and replacement area',
    text: 'A test pit must be within 25 ft of each drainfield boundary and of each replacement area. A waiver (pits at ≥ 25 % of drainfields, consistent soils, local approval) applies to one application only.',
    source: `ARM 17.36.325; ${DEQ4}; ${HC3}`,
    section: 'ARM 17.36.325(3), (3)(b); DEQ-4 §2.1.4; HC-3 §3.7',
    effective: `8/8/2014; ${DEQ4_EFF}; ${HC3_EFF}`,
    juris: 'ALL',
  },
  keyed: {
    id: 'keyed',
    title: 'Pits and perc tests keyed by number',
    text: 'Each test hole and percolation test must be keyed by a unique number on the lot layout, and all test holes and perc tests performed on the parcel must be submitted.',
    source: `ARM 17.36.325; ${DEQ4}`,
    section: 'ARM 17.36.325(1), (3)(b); DEQ-4 §2.1.9',
    effective: `8/8/2014; ${DEQ4_EFF}`,
    juris: 'ALL',
  },
  siteEvalNumber: {
    id: 'site-eval-number',
    title: 'Site Evaluation number',
    text: 'The GCCHD Site Evaluation # (confirmation number) goes on every soil log and on the application.',
    source: 'GCCHD WWTS Application',
    section: 'Rev. 05.23.2025 p1',
    effective: HC3_EFF,
    juris: 'CTY',
  },
  percHole: {
    id: 'perc-hole',
    title: 'Perc hole',
    text: 'Bore a 6–10 in. diameter hole at the proposed infiltrative depth (12 in. for mound and at-grade systems), within the proposed absorption system. Record the location, diameter and depth of each hole.',
    source: DEQ4,
    section: 'DEQ-4 App. A p124–126; §2.1.5',
    effective: DEQ4_EFF,
    juris: 'ALL',
  },
  percSoak: {
    id: 'perc-soak',
    title: 'Perc presoak',
    text: 'Sandy clay loam or finer, or a filling that does not seep away in 60 minutes: keep at least 12 in. of water in the hole for at least 4 hours to presoak.',
    source: DEQ4,
    section: 'DEQ-4 App. A p124',
    effective: DEQ4_EFF,
    juris: 'ALL',
  },
  percStop: {
    id: 'perc-stop',
    title: 'Perc stop rule',
    text: 'Other soils: at least 1 hour and 4 measurements, continuing until 2 successive rates do not vary by more than 15 percent or until measurements have been taken for 4 hours. Sandy soils: at least 4 equally spaced readings within 1 hour. Use the final water-level drop.',
    source: DEQ4,
    section: 'DEQ-4 App. A p124–125',
    effective: DEQ4_EFF,
    juris: 'ALL',
  },
  percRate: {
    id: 'perc-rate',
    title: 'Perc rate formula',
    text: 'Percolation Rate = Time interval in minutes / water-level drop in inches.',
    source: DEQ4,
    section: 'DEQ-4 App. A p125',
    effective: DEQ4_EFF,
    juris: 'ALL',
  },
  gwWell: {
    id: 'gw-well',
    title: 'Groundwater observation reading (A − B)',
    text: 'B = top of pipe to natural ground; A = top of pipe to water. A − B is the depth of water below natural ground. If the pipe is dry, enter the total depth measured and "dry". Pipes stick up at least 2 ft.',
    source: DEQ4,
    section: 'DEQ-4 App. C p139–141',
    effective: DEQ4_EFF,
    juris: 'ALL',
  },
  gwSchedule: {
    id: 'gw-schedule',
    title: 'Groundwater observation schedule',
    text: 'Observe during the time when ground water levels are highest, weekly or more frequently, with at least two weeks of observation prior to and after the ground water peak, otherwise the reviewing authority may reject the results.',
    source: DEQ4,
    section: 'DEQ-4 App. C p139',
    effective: DEQ4_EFF,
    juris: 'ALL',
  },
} as const satisfies Record<string, Rule>;

export type RuleKey = keyof typeof RULES;

export interface Subject {
  kind: 'site' | 'pit' | 'perc' | 'well';
  /** Pit, perc test or observation well id ('' for the site). */
  id: string;
  /** `Test pit 2`, `Perc test 1`, `Site`. */
  name: string;
}

export interface Warning {
  rule: Rule;
  subject: Subject;
  message: string;
}

// ---- soils ------------------------------------------------------------------

/**
 * DEQ-4 Table 2.1-1 (p19) application rate (gpd/ft²) for a logged texture; null if the class
 * is not in the table (or the sand size that decides it is not recorded).
 * [I] Fine sand is not listed; it is placed with medium sand (0.6). Very fine sandy loam with fine sandy loam (0.5).
 */
export function applicationRate(h: Pick<Horizon, 'texture'>): number | null {
  const { cls, sandSize: s } = h.texture;
  switch (cls) {
    case 'SAND':
      return s === 'VERY COARSE' || s === 'COARSE' ? 0.8 : s === 'MEDIUM' || s === 'FINE' ? 0.6 : s === 'VERY FINE' ? 0.4 : null;
    case 'LOAMY SAND':
      return 0.8;
    case 'SANDY LOAM':
      return s === 'FINE' || s === 'VERY FINE' ? 0.5 : 0.6;
    case 'LOAM':
      return 0.5;
    case 'SILT LOAM':
    case 'SANDY CLAY LOAM':
      return 0.4;
    case 'CLAY LOAM':
    case 'SILTY CLAY LOAM':
      return 0.3;
    case 'SANDY CLAY':
      return 0.2;
    case 'SILT':
    case 'SILTY CLAY':
    case 'CLAY':
      return 0.15;
    default:
      return null;
  }
}

/** Infiltrative depth the checks use: the entered depth; 0 for mound/at-grade (natural ground surface); else 24" standard trench (DEQ-4 §6.1.3.5). */
export function infiltrativeDepth(d: Design): number {
  if (d.infiltrativeDepthIn != null) return d.infiltrativeDepthIn;
  return d.system === 'MOUND' || d.system === 'AT-GRADE' ? 0 : 24;
}

/** Horizons from the infiltrative surface down to 12 in. below it (the receiving soil). */
function receivingHorizons(pit: TestPit, depth: number): Horizon[] {
  return pit.horizons.filter((h) => h.topIn != null && h.topIn < depth + 12 && (h.bottomIn == null || h.bottomIn > depth));
}

/** Shallowest limiting condition recorded at the pit, with what it is. */
export function limitingDepth(pit: TestPit): { depthIn: number; what: string } | null {
  const c: { depthIn: number; what: string }[] = [];
  const l = pit.limitingLayer;
  if (l.type && l.type !== 'NONE' && l.depthIn != null) c.push({ depthIn: l.depthIn, what: l.type === 'SHGW' ? 'seasonal high groundwater' : l.type === 'OTHER' ? l.other.toLowerCase() || 'limiting layer' : l.type.toLowerCase() });
  if ((pit.observedWater.kind === 'SEEPAGE' || pit.observedWater.kind === 'STANDING') && pit.observedWater.depthIn != null)
    c.push({ depthIn: pit.observedWater.depthIn, what: 'observed groundwater' });
  if (pit.shgw.depthIn != null && !pit.shgw.deeperThan) c.push({ depthIn: pit.shgw.depthIn, what: 'seasonal high groundwater' });
  return c.sort((a, b) => a.depthIn - b.depthIn)[0] ?? null;
}

const applies = (rule: Rule, d: Design) => rule.juris === 'ALL' || !d.review || rule.juris === d.review;

// ---- checks -----------------------------------------------------------------

export function pitWarnings(r: FieldRecord, pit: TestPit): Warning[] {
  const d = r.design;
  const out: Warning[] = [];
  const subject: Subject = { kind: 'pit', id: pit.id, name: `Test pit ${pit.label}` };
  const warn = (rule: Rule, message: string) => applies(rule, d) && out.push({ rule, subject, message });
  const depth = pitDepth(pit);
  const lim = limitingDepth(pit);
  const inf = infiltrativeDepth(d);
  const slope = pit.slope.pct;
  const recorded = pit.limitingLayer.type !== '' && pit.limitingLayer.type !== 'NONE';
  const logged = pit.horizons.length > 0;

  if (logged && depth != null && depth < 96 && !recorded)
    warn(RULES.pitDepth, `Pit is ${depth}" deep with no limiting layer recorded: dig to 96" or record what stopped digging.`);

  if (lim && lim.depthIn <= 84) warn(RULES.limitingWithin84, `${cap(lim.what)} at ${lim.depthIn}" (within 84"): additional test pits may be required.`);

  const gw = gwEvidence(pit);
  if (gw) warn(RULES.gwTrigger, `${gw}: groundwater may be within 84". Install observation pipes (≥ 8 ft) and monitor through the seasonal high.`);

  if (lim) {
    const sep = lim.depthIn - inf;
    const at = `${sep}" from the ${inf ? `${inf}" infiltrative surface` : 'ground surface'} to ${lim.what} at ${lim.depthIn}"`;
    if (sep < 48) warn(RULES.separation, `Separation ${at}; at least 48" is required.`);
    else if (slope != null && slope > 15 && sep < 72) warn(RULES.steepSeparation, `Slope ${slope}% with separation ${at}; at least 72" is required on slopes over 15%.`);
  }

  if (slope != null) {
    if (slope > 35) warn(RULES.slopeLimit, `Slope ${slope}%: over 35%, no drainfield allowed.`);
    else if (slope > 25) warn(RULES.slopeLimit, `Slope ${slope}%: 25–35% needs a pressure-dosed system by waiver after local health department consultation.`);
    else if (slope > 15)
      warn(RULES.slopeLimit, d.system === 'GRAVITY' || !d.system ? `Slope ${slope}%: gravity systems are not allowed over 15%; pressure dosing (≤ 5,000 gpd) with no-outflow evidence is needed.` : `Slope ${slope}%: 15–25% needs evidence that effluent will not surface downslope (≤ 5,000 gpd).`);
    if (slope > 15) warn(RULES.slopeContours, `Slope ${slope}%: a 2-ft contour map may be required within 25 ft of the absorption and replacement areas.`);
    if (slope > 35) warn(RULES.steepSetback, `Slope ${slope}%: setback 25 ft from drainfields and 10 ft from components to slopes over 35%.`);
  }
  const receiving = receivingHorizons(pit, inf);
  const rates = receiving.map((h) => ({ h, rate: applicationRate(h) })).filter((x) => x.rate != null) as { h: Horizon; rate: number }[];
  if (slope != null) {
    const sysMax = d.system === 'AT-GRADE' ? 6 : d.system === 'MOUND' ? 12 : d.system === 'ETA' ? 15 : null;
    if (sysMax != null && slope > sysMax) warn(RULES.systemSlope, `Slope ${slope}% exceeds the ${sysMax}% limit for ${SYSTEM_NAME[d.system]} systems.`);
    else if (d.system === 'MOUND' && slope > 6 && rates.some((x) => x.rate <= 0.3))
      warn(RULES.systemSlope, `Slope ${slope}%: a mound on a 0.2–0.3 gpd/ft² basal soil is limited to 6%.`);
  }

  const percAtPit = r.percTests.some((t) => t.testPitId === pit.id);
  const slow = rates.find((x) => x.rate <= 0.4);
  if (slow && !percAtPit && !r.percTests.some((t) => !t.testPitId))
    warn(RULES.percRequired, `${slow.h.texture.cls} at the ${inf}" infiltrative depth (${slow.rate} gpd/ft²): a perc test is required.`);
  const gravity = d.system !== 'PRESSURE' && d.system !== 'MOUND' && d.system !== 'AT-GRADE';
  const fast = rates.find((x) => x.rate >= 0.6);
  const fastPerc = r.percTests
    .filter((t) => t.testPitId === pit.id)
    .map((t) => ({ t, rate: stopRule(t).finalRateMpi }))
    .find((x) => x.rate != null && x.rate < 10);
  if (gravity && fast) warn(RULES.pressureRequired, `${fast.h.texture.cls} at the ${inf}" infiltrative depth (${fast.rate} gpd/ft²): the system must be pressure distributed.`);
  else if (gravity && fastPerc) warn(RULES.pressureRequired, `Perc test ${fastPerc.t.label} final rate ${fastPerc.rate!.toFixed(1)} mpi (faster than 10 mpi): the system must be pressure distributed.`);
  // fn c: gravel always; fn d: loamy/coarse sand only with < 6 ft from trench bottom to a limiting layer (or the pit bottom, if none found).
  const gravel = receiving.find((h) => h.texture.cls === 'SAND' && h.texture.sandSize === 'VERY COARSE' || (h.rock.kind === 'GRAVEL' && (h.rock.pct ?? 0) > 60));
  const below = lim ? lim.depthIn - inf : depth != null ? depth - inf : null;
  const sandy = receiving.find((h) => h.texture.cls === 'LOAMY SAND' || (h.texture.cls === 'SAND' && h.texture.sandSize === 'COARSE'));
  if (gravel) warn(RULES.coarseSoil, `${gravel.texture.cls || 'Gravel'} at the infiltrative depth: if faster than 3 mpi the system must be pressure dosed and sand lined.`);
  else if (sandy && below != null && below < 72)
    warn(RULES.coarseSoil, `${sandy.texture.cls} at the infiltrative depth with only ${below}" ${lim ? `to ${lim.what}` : 'logged below it'}: pressure distribution is required under 6 ft.`);

  // Either wall's fix locates the pit: both walls are the same hole.
  const located = r.testPits.some((p) => p.location && (p === pit || wallOf(p.label).pit === wallOf(pit.label).pit));
  if (logged && !located) warn(RULES.location, 'No GPS location recorded for this pit.');
  return out;
}

/** Why groundwater may be within 84" (water, SHGW estimate, mottles), or null. */
function gwEvidence(pit: TestPit): string | null {
  const w = pit.observedWater;
  if ((w.kind === 'SEEPAGE' || w.kind === 'STANDING') && w.depthIn != null && w.depthIn <= 84) return `Water observed at ${w.depthIn}"`;
  if (pit.shgw.depthIn != null && !pit.shgw.deeperThan && pit.shgw.depthIn <= 84) return `Seasonal high groundwater estimated at ${pit.shgw.depthIn}"`;
  if (pit.limitingLayer.type === 'SHGW' && pit.limitingLayer.depthIn != null && pit.limitingLayer.depthIn <= 84) return `Seasonal high groundwater limiting layer at ${pit.limitingLayer.depthIn}"`;
  const mottled = pit.horizons.find((h) => h.mottling.present === 'Y' && h.topIn != null && h.topIn <= 84);
  if (mottled) return `Mottles (redox features) from ${mottled.topIn}"`;
  return null;
}

export function percWarnings(r: FieldRecord, t: PercTest, now: string): Warning[] {
  const d = r.design;
  const out: Warning[] = [];
  const subject: Subject = { kind: 'perc', id: t.id, name: `Perc test ${t.label}` };
  const warn = (rule: Rule, message: string) => applies(rule, d) && out.push({ rule, subject, message });

  if (t.holeDiameterIn != null && (t.holeDiameterIn < 6 || t.holeDiameterIn > 10)) warn(RULES.percHole, `Hole diameter ${t.holeDiameterIn}" is outside 6–10".`);
  if (t.holeDepthIn == null) warn(RULES.percHole, 'Hole depth is not recorded (required on the perc form).');
  else if (d.system === 'MOUND' || d.system === 'AT-GRADE') {
    if (t.holeDepthIn !== 12) warn(RULES.percHole, `Hole is ${t.holeDepthIn}" deep; ${SYSTEM_NAME[d.system]} systems are tested at 12".`);
  } else if (Math.abs(t.holeDepthIn - infiltrativeDepth(d)) > 6)
    warn(RULES.percHole, `Hole is ${t.holeDepthIn}" deep; the proposed infiltrative depth is ${infiltrativeDepth(d)}".`);

  if (soakStatus(t, now).step === 'presoak-short') warn(RULES.percSoak, soakStatus(t, now).message);

  t.readings.forEach((x, i) => {
    const c = readingCalc(x);
    if (x.endAt && c.dropIn != null && c.dropIn <= 0) warn(RULES.percRate, `Reading ${i + 1}: drop is ${c.dropIn.toFixed(2)}"; final must be deeper than initial for a rate.`);
    if (c.intervalMin != null && c.intervalMin <= 0) warn(RULES.percRate, `Reading ${i + 1}: end time is not after the start time.`);
  });

  const s = stopRule(t);
  for (const w of s.warnings) warn(RULES.percStop, w);
  if (t.readings.some((x) => x.endAt) && !s.met) warn(RULES.percStop, `Stop rule not met yet: ${s.message}`);
  if (!t.testPitId) warn(RULES.location, 'Not linked to a test pit: record its location (link the nearest pit or note it).');
  return out;
}

export function siteWarnings(r: FieldRecord): Warning[] {
  const d = r.design;
  const out: Warning[] = [];
  const subject: Subject = { kind: 'site', id: '', name: 'Site' };
  const warn = (rule: Rule, message: string) => applies(rule, d) && out.push({ rule, subject, message });
  const logged = r.testPits.filter((p) => p.horizons.length > 0);

  const multi = d.use === 'MULTIPLE' || d.use === 'PUBLIC';
  const fields = d.drainfields ?? (d.use ? 1 : 0);
  const byField = fields * (multi ? 3 : 1);
  const byZone = d.system === 'PRESSURE' ? (d.pressureZones ?? 0) : 0;
  const need = Math.max(byField, byZone);
  if (need && logged.length < need) {
    const why =
      byZone > byField
        ? `${byZone} pressure zones need at least ${byZone} (one per zone)`
        : `${fields} ${multi ? `${USE_NAME[d.use].toLowerCase()} ` : ''}drainfield${fields === 1 ? '' : 's'} need at least ${byField}${multi ? ' (three each)' : ''}`;
    warn(RULES.pitCount, `${logged.length} test pit${logged.length === 1 ? '' : 's'} logged; ${why}.`);
  }
  if (logged.length) warn(RULES.pitDistance, 'Confirm on the layout that a pit is within 25 ft of every drainfield and every replacement area.');

  for (const [what, labels] of [
    ['Test pit', r.testPits.map((p) => p.label.trim())],
    ['Perc test', r.percTests.map((t) => t.label.trim())],
  ] as const) {
    const dup = labels.filter((l, i) => l && labels.indexOf(l) !== i);
    for (const l of new Set(dup)) warn(RULES.keyed, `${what} # ${l} is used more than once; each must be keyed by a unique number.`);
  }
  for (const p of r.testPits) if (!p.horizons.length && (p.planned || p.location)) warn(RULES.keyed, `Test pit ${p.label} is on the map but has no soil log.`);

  if (!r.header.confirmationNumber.trim()) warn(RULES.siteEvalNumber, 'No Site Evaluation # (confirmation number) in the header.');
  return out;
}

/** Every warning on the record, site first, then pits and perc tests in order. */
/** Every warning, site first; `percTests: false` (the perc module is off) leaves out the perc tests'. */
export function allWarnings(r: FieldRecord, now: string, opts: { percTests?: boolean } = {}): Warning[] {
  const percs = opts.percTests === false ? [] : r.percTests;
  return [...siteWarnings(r), ...r.testPits.flatMap((p) => pitWarnings(r, p)), ...percs.flatMap((t) => percWarnings(r, t, now))];
}

// ---- groundwater observation wells -----------------------------------------

export interface WellReading {
  /** Top of pipe to water, inches; with `dry`, the total depth measured. */
  aIn: number | null;
  /** Top of pipe to natural ground, inches. */
  bIn: number | null;
  dry: boolean;
}

export interface WellResult {
  /** A − B: depth of water below natural ground, inches; null if dry or incomplete. */
  depthIn: number | null;
  /** Dry: water is deeper than this (total depth − B). */
  deeperThanIn: number | null;
  warnings: string[];
}

/** DEQ-4 App. C p140–141: A − B; a dry pipe gives only "deeper than" (no numeric water depth). */
export function wellReading(x: WellReading): WellResult {
  const warnings: string[] = [];
  if (x.aIn == null || x.bIn == null) return { depthIn: null, deeperThanIn: null, warnings };
  if (x.bIn < 24) warnings.push(`Stick-up B is ${x.bIn}"; pipes should stick up at least 24" (DEQ-4 App. C p140).`);
  if (x.aIn < x.bIn) warnings.push(`A (${x.aIn}") is less than B (${x.bIn}"): water above ground? Check the readings.`);
  if (x.dry) return { depthIn: null, deeperThanIn: x.aIn - x.bIn, warnings };
  const depthIn = x.aIn - x.bIn;
  if (depthIn < 72) warnings.push(`Water at ${depthIn}" (shallower than 6 ft): additional observation wells may be required (DEQ-4 App. C p139).`);
  return { depthIn, deeperThanIn: null, warnings };
}

export const SYSTEM_NAME: Record<Design['system'], string> = {
  '': 'proposed',
  GRAVITY: 'gravity trench',
  PRESSURE: 'pressure-dosed trench',
  'AT-GRADE': 'at-grade',
  MOUND: 'elevated sand mound',
  ETA: 'ETA/ET',
};
export const USE_NAME: Record<Design['use'], string> = {
  '': '',
  INDIVIDUAL: 'Individual',
  SHARED: 'Shared',
  MULTIPLE: 'Multiple-user',
  PUBLIC: 'Public',
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
