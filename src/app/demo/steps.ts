// The demo script (spec 2026-10-03): one step per field group along the field path. Each step names
// the screen it happens on, what to highlight, when the user's own action completes it, a short
// correction for a wrong entry, and "Show me" (the step done through the real controls).
// Tips are one or two plain sentences (Nathan, 2026-10-04): what to do, and why only where it is not
// obvious.
import { updateTestPit, type FieldRecord, type TestPit } from '../../domain/fieldRecord';
import { acceptFlag, openFlags } from '../../domain/pitChecks';
import { pitGroups, wallOf } from '../../domain/pitWalls';
import { missingItems } from '../../domain/soilLogText';
import { STRUCTURELESS } from '../../domain/vocabulary';
import type { RecordStore } from '../../storage/db';
import { lastCountyLookup } from '../county';
import { DEMO_KEY, type DemoHorizon } from '../fieldGuide';
import { stopFix } from '../gps';
import { storePhoto } from '../PitMedia';
import { byText, fetchFile, field, giveFile, horizonCard, input, pick, shown, tap, type, wait } from './dom';
import { demoState, liveRecord, setDemoState, type Live } from './state';
import goodPhotoUrl from './demo-wall-good.jpg';
import retakePhotoUrl from './demo-wall-retake.jpg';

export type Screen = 'home' | 'settings' | 'site' | 'pitA' | 'pitB' | 'print' | 'other' | 'loading';

export const SCREEN_NAMES: Record<Screen, string> = {
  home: 'the home screen',
  settings: 'Settings',
  site: 'the site evaluation',
  pitA: 'wall 1A',
  pitB: 'wall 1B',
  print: 'the soil log',
  other: 'another screen',
  loading: 'another screen',
};

export interface Ctx {
  r?: FieldRecord;
  live?: Live;
  screen: Screen;
  wallA?: TestPit;
  wallB?: TestPit;
  store: RecordStore;
}

export interface Step {
  id: string;
  screen: Screen;
  /** Other screens the step continues on (a step that walks from one screen to the next). */
  also?: Screen[];
  title: string;
  /** One or two plain sentences. With a sample, it ends without a full stop: the tip adds ", e.g. …". */
  text: (c: Ctx) => string;
  /** The answer key value the tip shows. */
  sample?: string | ((c: Ctx) => string | undefined);
  /** What to highlight; none: the tip sits in the middle of the screen. */
  target?: (c: Ctx) => HTMLElement[];
  /** Completed by the user's action (auto-advance). Steps without it advance on their button. */
  done?: (c: Ctx) => boolean;
  /** Completed by going to another screen (checked off this step's screen too). */
  leaves?: boolean;
  /** Typed fields complete once the typing is committed (keyboard Done/Enter, or the tip's Next). */
  typed?: boolean;
  /** A short correction for a wrong entry, shown on the field. */
  problem?: (c: Ctx) => string | undefined;
  showMe?: (c: Ctx) => Promise<void>;
  /** A picture under the tip's text: what the user is asked to make (a good wall photo). */
  image?: string;
  /**
   * Taps on the highlighted Take photo, From gallery or Retake run Show me (the sample photo) instead of
   * opening the camera: a practice job has no wall to photograph.
   */
  samplePhoto?: boolean;
  /** The tip's own button on steps the user reads (Next, Finish, Done). */
  button?: { label: string; run?: (c: Ctx) => Promise<void> | void };
  /** The tip may cover the highlight's lower part when neither side has room (a printed page). */
  tipOver?: boolean;
  /** Changes when the highlight moves within the step (it scrolls again). */
  part?: (c: Ctx) => string;
  /** Runs once when the step completes, before the next one. */
  after?: (c: Ctx) => Promise<void>;
}

export function screenOf(hash: string, r: FieldRecord | undefined, recordId: string | undefined): Screen {
  const p = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (!p.length) return 'home';
  if (p[0] === 'settings') return 'settings';
  if (p[0] !== 'se' || p[1] !== recordId) return 'other';
  if (!r) return 'loading';
  if (!p[2]) return 'site';
  if (p[2] === 'print') return 'print';
  if (p[2] === 'pit') {
    const wall = r.testPits.find((w) => w.id === p[3]);
    return wall ? (wallOf(wall.label).wall === 'B' ? 'pitB' : 'pitA') : 'other';
  }
  return 'other';
}

export function walls(r?: FieldRecord): { wallA?: TestPit; wallB?: TestPit } {
  const g = r && pitGroups(r.testPits)[0];
  return { wallA: g?.walls.find((w) => wallOf(w.label).wall !== 'B'), wallB: g?.walls.find((w) => wallOf(w.label).wall === 'B') };
}

/** Whether the screen is one the step happens on. */
export const onStepScreen = (step: Step, screen: Screen) => screen === step.screen || !!step.also?.includes(screen);

/** Where "Take me back" goes for a step's screen. */
export function hashFor(screen: Screen, c: Ctx): string | undefined {
  const id = c.r?.id ?? demoState()?.recordId;
  if (screen === 'home') return '#/';
  if (screen === 'settings') return '#/settings';
  if (!id) return undefined;
  if (screen === 'site') return `#/se/${id}`;
  if (screen === 'print') return `#/se/${id}/print/soil-logs`;
  if (screen === 'pitA' && c.wallA) return `#/se/${id}/pit/${c.wallA.id}`;
  if (screen === 'pitB' && c.wallB) return `#/se/${id}/pit/${c.wallB.id}`;
  return `#/se/${id}`;
}

const H = DEMO_KEY.header;
const filled = (v: string | undefined) => (v ?? '').trim().length >= 2;
const one = (el: HTMLElement | null) => shown([el]);
/** Always the record as saved last, for edits made after an await. */
const latest = (c: Ctx) => liveRecord()?.record ?? c.r!;
const save = (c: Ctx, r: FieldRecord) => (liveRecord() ?? c.live)!.save(r);
/** Waits until `ok`, up to `ms`. */
async function until(ok: () => boolean, ms: number) {
  for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await wait(200);
}

function headerStep(id: string, label: string, key: keyof typeof H, title: string, text: string, problem?: (v: string) => string | undefined): Step {
  return {
    id,
    screen: 'site',
    title,
    text: () => text,
    sample: H[key],
    target: () => one(field(label)),
    typed: true,
    done: (c) => filled(c.r?.header[key]) && !problem?.(c.r!.header[key]),
    problem: (c) => (c.r?.header[key] ? problem?.(c.r.header[key]) : undefined),
    showMe: async () => type(input(label), H[key]),
  };
}

// ---- Horizons -------------------------------------------------------------------------------------

const lower = (s: string) => s.toLowerCase();
const structureless = (shape: string) => STRUCTURELESS.includes(shape);

interface Part {
  name: string;
  title: string;
  /** The tip, in the order the user taps; `h` is this horizon's answer key, `card` its card on the screen. */
  text: (h: DemoHorizon, card?: HTMLElement | null) => string;
  sample: (h: DemoHorizon) => string;
  target: (card: HTMLElement) => (HTMLElement | null)[];
  done: (w: TestPit, i: number) => boolean;
  show: (card: HTMLElement, h: DemoHorizon) => Promise<void>;
  /** A part taller than a phone screen with its tip is highlighted a piece at a time. */
  piece?: (card: HTMLElement) => string;
  typed?: boolean;
}
const hz = (w: TestPit | undefined, i: number) => w?.horizons[i];
const shapePicked = (card: HTMLElement) => !!field('Shape', card)?.querySelector('.chip.on');
const PARTS: Part[] = [
  {
    name: 'depth',
    title: 'Horizon and depth',
    text: (h) => (h.topIn === 0 ? 'Pick the horizon, then its bottom depth' : 'The top is already the bottom of the horizon above. Pick the horizon, then its bottom depth'),
    sample: (h) => `${h.designation}, ${h.topIn}–${h.bottomIn}"`,
    target: (card) => [field('Horizon', card), field('Top', card)?.closest('.pair') as HTMLElement, field('Quick bottom', card)],
    done: (w, i) => {
      const h = hz(w, i)!;
      return !!h.designation.trim() && h.bottomIn != null && h.bottomIn > (h.topIn ?? 0);
    },
    show: async (card, h) => {
      await pick(card, 'Horizon', h.designation);
      await pick(card, 'Quick bottom', `${h.bottomIn}"`);
    },
  },
  {
    name: 'color',
    title: 'Munsell color',
    text: () => 'Pick the Munsell hue, value and chroma',
    sample: (h) => `${h.color.hue} ${h.color.value}/${h.color.chroma}`,
    target: (card) => [field('Color (Munsell)', card)],
    done: (w, i) => {
      const c = hz(w, i)!.color;
      return !!(c.hue && c.value && (c.chroma || c.hue === 'N')) || !!c.other;
    },
    show: async (card, h) => {
      await pick(card, 'Hue', h.color.hue);
      await pick(card, 'Value', h.color.value);
      await pick(card, 'Chroma', h.color.chroma);
    },
  },
  {
    name: 'texture',
    title: 'Texture',
    text: () => 'Pick the USDA texture class',
    sample: (h) => lower(h.texture),
    target: (card) => [field('USDA class', card)],
    done: (w, i) => !!hz(w, i)!.texture.cls.trim(),
    show: (card, h) => pick(card, 'USDA class', h.texture),
  },
  {
    name: 'rock',
    title: 'Rock fragments',
    text: (h) => (h.rockKind ? 'Enter the rock fragments as a percent by volume, then pick the rock size' : 'Enter the rock fragments as a percent by volume'),
    sample: (h) => (h.rockKind ? `${h.rockPct}%, ${lower(h.rockKind)}` : `${h.rockPct}%`),
    target: (card) => [field('Rock fragments (by volume)', card), field('Rock size', card)],
    typed: true,
    // The size is picked too, though the soil log needs it only from 15% (Nathan, 2026-10-04: the demo
    // skipped it at 10%). ROCKS is the unpicked default.
    done: (w, i) => {
      const r = hz(w, i)!.rock;
      return r.pct != null && (r.pct === 0 || r.kind !== 'ROCKS') && !missingItems(w).horizons[i].some((m) => m.startsWith('rock'));
    },
    show: async (card, h) => {
      await type(input('Rock fragments (by volume)', card), String(h.rockPct));
      if (h.rockKind) await pick(card, 'Rock size', h.rockKind);
    },
  },
  {
    name: 'structure',
    title: 'Structure',
    text: (h, card) =>
      structureless(h.structure.shape)
        ? 'Pick the shape. Massive and single grain have no grade or size'
        : card && shapePicked(card)
          ? 'Now pick the grade and size'
          : 'Pick the shape, then the grade and size',
    sample: (h) => lower([h.structure.shape, h.structure.grade, h.structure.size].filter(Boolean).join(', ')),
    // Shape first, then grade and size: all three with the tip do not fit on a phone screen.
    target: (card) => (shapePicked(card) ? [field('Grade', card), field('Size', card)] : [field('Shape', card)]),
    piece: (card) => (shapePicked(card) ? 'grade' : 'shape'),
    // Shape, grade and size all picked; a structureless shape has no grade or size.
    done: (w, i) => {
      const s = hz(w, i)!.structure;
      return !!s.other || (!!s.shape && (structureless(s.shape) || (!!s.grade && !!s.size)));
    },
    show: async (card, h) => {
      await pick(card, 'Shape', h.structure.shape);
      if (h.structure.grade) await pick(card, 'Grade', h.structure.grade);
      if (h.structure.size) await pick(card, 'Size', h.structure.size);
    },
  },
  {
    name: 'consistence',
    title: 'Consistence and plasticity',
    text: () => 'Pick the moist consistence and the plasticity',
    sample: (h) => lower(`${h.consistence}, ${h.plasticity}`),
    target: (card) => [field('Consistence', card), field('Plasticity', card)],
    done: (w, i) => !!hz(w, i)!.consistence && !!hz(w, i)!.plasticity,
    show: async (card, h) => {
      await pick(card, 'Consistence', h.consistence);
      await pick(card, 'Plasticity', h.plasticity);
    },
  },
  {
    name: 'roots',
    title: 'Roots and mottling',
    text: () => 'Tap Yes or No for roots and for mottling',
    sample: (h) => `roots ${h.roots === 'Y' ? 'yes' : 'no'}, mottling ${h.mottling === 'Y' ? 'yes' : 'no'}`,
    target: (card) => [field('Roots', card)?.closest('.pair') as HTMLElement],
    done: (w, i) => !missingItems(w).horizons[i].some((m) => m === 'roots' || m.startsWith('mottl')),
    show: async (card, h) => {
      await pick(card, 'Roots', h.roots === 'Y' ? 'Yes' : 'No');
      await pick(card, 'Mottling', h.mottling === 'Y' ? 'Yes' : 'No');
    },
  },
];

const depthProblem = (w: TestPit | undefined, i: number) => {
  const h = hz(w, i);
  return h && h.bottomIn != null && h.topIn != null && h.bottomIn <= h.topIn ? 'The bottom must be below the top.' : undefined;
};

function horizonStep(i: number, part: Part): Step {
  const h = DEMO_KEY.horizons[i];
  return {
    id: `h${i + 1}-${part.name}`,
    screen: 'pitA',
    title: part.title,
    text: () => part.text(h, horizonCard(i + 1)),
    sample: part.sample(h),
    target: () => {
      const card = horizonCard(i + 1);
      return card ? shown(part.target(card)) : [];
    },
    part: () => {
      const card = part.piece && horizonCard(i + 1);
      return card ? part.piece!(card) : '';
    },
    typed: part.typed,
    done: (c) => !!hz(c.wallA, i) && part.done(c.wallA!, i),
    problem: (c) => depthProblem(c.wallA, i),
    showMe: async () => {
      const card = horizonCard(i + 1);
      if (card) await part.show(card, h);
    },
  };
}

const B2 = DEMO_KEY.horizons[1];
const addHorizon = () => byText<HTMLButtonElement>('button', 'Add horizon');
const horizonDone = (w: TestPit | undefined, i: number) => !!hz(w, i) && missingItems(w!).horizons[i].length === 0;
const nextPart = (w: TestPit | undefined, i: number) => (hz(w, i) ? PARTS.find((p) => !p.done(w!, i)) : undefined);

// ---- Photos and GPS -------------------------------------------------------------------------------

const photoInput = () => byText<HTMLLabelElement>('label', /^Take photo/)?.querySelector('input') ?? null;
const goodPhoto = () => fetchFile(goodPhotoUrl, 'pit-wall.jpg');

/** Decision 11: wall B starts with a dark, blurred photo, which the pit checks flag for a retake. */
async function plantRetakePhoto(c: Ctx) {
  const st = demoState();
  const { wallB } = walls(latest(c));
  if (!st || !wallB || st.planted) return;
  const ref = await storePhoto(c.store, latest(c).id, await fetchFile(retakePhotoUrl, 'pit-wall-1b.jpg'));
  save(c, updateTestPit(latest(c), wallB.id, { photos: [ref, ...wallB.photos] }));
  setDemoState({ ...demoState()!, planted: ref.id });
}
const plantedPhoto = (c: Ctx) => {
  const id = demoState()?.planted;
  return id ? c.wallB?.photos.find((p) => p.id === id) : undefined;
};
const plantedItem = (c: Ctx) => {
  const i = c.wallB?.photos.findIndex((p) => p.id === demoState()?.planted) ?? -1;
  return i < 0 ? null : document.querySelectorAll<HTMLElement>('ul.photos > li')[i] ?? null;
};

const gpsCard = () => document.querySelector<HTMLElement>('section[aria-labelledby^="gps-"]');
const gpsWaiting = () => !!gpsCard()?.querySelector('.gps-live');
const backLink = () => document.querySelector<HTMLElement>('.bar a.back');
const wallBLink = (c: Ctx) => (c.wallB ? document.querySelector<HTMLElement>(`a[href$="/pit/${c.wallB.id}"]`) : null);
const soilLogsLink = () => document.querySelector<HTMLElement>('a[href$="/print/soil-logs"]');

async function acceptOpen(c: Ctx) {
  let r = latest(c);
  for (const f of openFlags(r)) r = acceptFlag(r, f.wallId, f.id, 'Demo');
  if (r !== latest(c)) save(c, r);
  await wait(200);
}

const checksText = (n: number) =>
  n === 1
    ? 'One pit check is still open, and the soil log PDF waits until it is cleared. Tap Show me to accept it for this practice job.'
    : `${n} pit checks are still open, and the soil log PDF waits until they are cleared. Tap Show me to accept them for this practice job.`;

// ---- The script -----------------------------------------------------------------------------------

export const STEPS: Step[] = [
  {
    ...headerStep('project-number', 'Project #', 'projectNumber', 'Project #', '', (v) =>
      /^\d{4}\.\d{3}$/.test(v.trim()) ? undefined : 'Use four digits, a dot, then three digits, like 0271.001.',
    ),
    // A replay has no Exit button: the phone's back button ends it (Nathan, 2026-10-04), said once here.
    text: () =>
      demoState()?.replay
        ? 'This practice job takes about five minutes, and your back button ends it. Enter the project number'
        : 'This practice job takes about five minutes. Enter the project number',
  },
  headerStep('project-name', 'Project name', 'projectName', 'Project name', 'Enter the project name'),
  {
    id: 'location',
    screen: 'site',
    title: 'Location',
    text: (c) => (c.r?.header.county ? `The address is in ${c.r.header.county}.` : 'The app finds the county from the address. Enter the street address, city, state and ZIP'),
    sample: (c) => (c.r?.header.county ? undefined : H.location),
    target: () => one(field('Location')),
    typed: true,
    // Done once the county is found, or the lookup for this address came back without one.
    done: (c) => {
      const loc = c.r?.header.location.trim() ?? '';
      return filled(loc) && (!!c.r?.header.county || lastCountyLookup()?.address === loc);
    },
    showMe: async (c) => {
      await type(input('Location'), H.location);
      (document.activeElement as HTMLElement | null)?.blur?.();
      await until(() => lastCountyLookup()?.address === latest(c).header.location.trim(), 12_000);
      await wait(600);
    },
  },
  {
    id: 'eval-by',
    screen: 'site',
    title: 'Evaluated by and date',
    text: () => "Today's date is already filled in; change it if you dug on another day. Enter your name",
    sample: H.evalBy,
    target: () => shown([field('Evaluated by'), field('Date')]),
    typed: true,
    done: (c) => filled(c.r?.header.evalBy) && !!c.r?.header.date,
    showMe: async () => type(input('Evaluated by'), H.evalBy),
  },
  {
    id: 'confirmation',
    screen: 'site',
    title: 'Gallatin County and the confirmation number',
    text: (c) =>
      c.r?.header.gallatin === 'Y'
        ? 'The address is in Gallatin County, so this is set to Yes. Enter the confirmation number from the GCCHD'
        : c.r?.header.gallatin === 'N'
          ? 'Outside Gallatin County there is no confirmation number, and the soil log leaves the field off. Tap Yes if the site is in Gallatin County after all.'
          : 'Tap Yes if the site is in Gallatin County, then enter the confirmation number from the GCCHD',
    sample: (c) => (c.r?.header.gallatin === 'N' ? undefined : H.confirmationNumber),
    target: () => shown([field('Gallatin County site evaluation'), field('Confirmation number')]),
    typed: true,
    done: (c) => c.r?.header.gallatin === 'Y' && filled(c.r.header.confirmationNumber),
    showMe: async () => {
      await pick(document, 'Gallatin County site evaluation', 'Yes');
      await type(input('Confirmation number'), H.confirmationNumber);
    },
  },
  {
    id: 'add-pit',
    leaves: true,
    screen: 'site',
    title: 'Add a test pit only when you are standing at it',
    text: () => 'Add a test pit only when you are standing at it. GPS starts recording its location the moment you add it.',
    target: () => one(field('New test pit #')?.closest('form') as HTMLElement),
    done: (c) => !!c.wallA,
    showMe: async () => {
      await type(input('New test pit #'), DEMO_KEY.pit);
      await tap(byText<HTMLButtonElement>('button', 'Add test pit'));
    },
    after: plantRetakePhoto,
  },
  {
    id: 'gps',
    screen: 'pitA',
    title: 'GPS started when you added the pit',
    text: (c) =>
      c.wallA?.location
        ? 'GPS saved the location of this pit.'
        : gpsWaiting()
          ? "GPS is finding this pit's location and saves it once it is within 10 ft."
          : 'There is no GPS fix yet. Tap Capture GPS.',
    target: () => one(gpsCard()),
    done: (c) => !!c.wallA?.location,
    showMe: async (c) => {
      stopFix(c.wallA!.id);
      const { lat, lon, accuracyM } = DEMO_KEY.fix;
      save(c, updateTestPit(latest(c), c.wallA!.id, { location: { lat, lon, accuracyM, at: new Date().toISOString() } }));
      await wait(300);
    },
  },
  {
    id: 'gps-retake',
    screen: 'pitA',
    title: 'Retake GPS if it looks wrong',
    text: () => 'If the location ever looks wrong, stand at the pit and tap Retake GPS.',
    target: () => one(byText<HTMLElement>('button', 'Retake GPS') ?? gpsCard()),
    button: { label: 'Next' },
  },
  {
    id: 'photo',
    screen: 'pitA',
    title: 'Photo of the wall',
    text: () => 'Take a photo of the wall before you log it, with the ground surface at the top, like this one.',
    image: goodPhotoUrl,
    samplePhoto: true,
    target: () => one(document.querySelector<HTMLElement>('section[aria-labelledby^="photos-"] > .btn-row:last-of-type')),
    done: (c) => (c.wallA?.photos.length ?? 0) > 0,
    showMe: async () => giveFile(photoInput(), await goodPhoto()),
  },
  {
    id: 'add-horizon',
    screen: 'pitA',
    title: 'Log the first horizon',
    text: () => 'Now log the wall from the top down. Add your first horizon.',
    target: () => one(addHorizon()),
    done: (c) => (c.wallA?.horizons.length ?? 0) > 0,
    showMe: () => tap(addHorizon()),
  },
  ...PARTS.map((p) => horizonStep(0, p)),
  {
    id: 'h2',
    screen: 'pitA',
    title: 'The next horizon',
    text: (c) => {
      if (!hz(c.wallA, 1)) return 'Add your next horizon.';
      const part = nextPart(c.wallA, 1);
      return part ? part.text(B2, horizonCard(2)) : 'Horizon 2 is logged.';
    },
    sample: (c) => {
      const part = hz(c.wallA, 1) && nextPart(c.wallA, 1);
      return part ? part.sample(B2) : undefined;
    },
    target: (c) => {
      if (!hz(c.wallA, 1)) return one(addHorizon());
      const card = horizonCard(2);
      const part = nextPart(c.wallA, 1);
      return card && part ? shown(part.target(card)) : [];
    },
    part: (c) => {
      if (!hz(c.wallA, 1)) return 'add';
      const part = nextPart(c.wallA, 1);
      const card = part?.piece && horizonCard(2);
      return part ? `${part.name}${card ? `:${part.piece!(card)}` : ''}` : 'done';
    },
    // The rock percent is typed: the step waits for it to be committed like the other typed fields.
    typed: true,
    done: (c) => horizonDone(c.wallA, 1),
    problem: (c) => depthProblem(c.wallA, 1),
    showMe: async (c) => {
      if (!hz(walls(latest(c)).wallA, 1)) await tap(addHorizon());
      const card = horizonCard(2);
      for (const p of PARTS) if (card && !p.done(walls(latest(c)).wallA!, 1)) await p.show(card, B2);
    },
  },
  {
    id: 'summary',
    screen: 'pitA',
    title: 'Test pit summary',
    text: (c) =>
      c.wallA && missingItems(c.wallA).pit.length
        ? `The pit summary still needs the ${missingItems(c.wallA).pit.join(', ')}.`
        : 'The pit summary fills in from your horizons. Open it only if this pit had groundwater, a limiting layer or a different slope.',
    target: () => one(document.querySelector<HTMLElement>('section[aria-label="Test pit summary"] summary')),
    button: { label: 'Next' },
  },
  {
    id: 'to-b',
    leaves: true,
    screen: 'pitA',
    also: ['site'],
    title: 'On to wall B',
    text: (c) =>
      c.screen === 'site' ? 'Open wall 1B, the opposite wall of the same pit.' : 'Wall A is logged. Go back and open wall B, the opposite wall of the same pit.',
    target: (c) => one(c.screen === 'site' ? wallBLink(c) : backLink()),
    part: (c) => c.screen,
    done: (c) => c.screen === 'pitB',
    showMe: async (c) => {
      if (!wallBLink(c)) {
        await tap(backLink());
        await until(() => !!wallBLink(c), 3000);
      }
      await tap(wallBLink(c));
    },
  },
  {
    id: 'copy-a',
    screen: 'pitB',
    title: 'Start from wall A',
    text: () => "Wall B is the same hole, so start from wall A's horizons. Then change only the depths that differ.",
    target: () => one(byText<HTMLElement>('button', /^Copy horizons from wall/)),
    done: (c) => (c.wallB?.horizons.length ?? 0) > 0,
    showMe: () => tap(byText<HTMLElement>('button', /^Copy horizons from wall/)),
  },
  {
    id: 'retake',
    screen: 'pitB',
    title: 'Retake a bad photo',
    text: () => 'This photo is too dark and blurry to read the soil colours. Tap Retake to replace it with one like this.',
    image: goodPhotoUrl,
    samplePhoto: true,
    target: (c) => shown([plantedItem(c)?.querySelector<HTMLElement>('.alert'), plantedItem(c)?.querySelector<HTMLElement>('.btn-row')]),
    done: (c) => !!demoState()?.planted && !plantedPhoto(c),
    showMe: async (c) => giveFile(plantedItem(c)?.querySelector<HTMLInputElement>('input[type="file"]') ?? null, await goodPhoto()),
  },
  {
    id: 'to-site-2',
    leaves: true,
    screen: 'pitB',
    title: 'Back to the site evaluation',
    text: () => 'Both walls are logged. Tap the back arrow to return to the site evaluation.',
    target: () => one(backLink()),
    done: (c) => c.screen !== 'pitB',
    showMe: () => tap(backLink()),
  },
  {
    id: 'dropbox',
    screen: 'site',
    title: 'Dropbox',
    text: () => 'On a real job, the soil logs and photos are saved to the project folder in Dropbox automatically. It is turned off for this practice job.',
    target: () => one(document.querySelector<HTMLElement>('section[aria-labelledby="dbx"]')),
    button: { label: 'Next' },
  },
  {
    id: 'soil-log',
    leaves: true,
    screen: 'site',
    title: 'Open the soil log',
    text: (c) => {
      const n = c.r ? openFlags(c.r).length : 0;
      return n ? checksText(n) : 'Tap Soil logs to see the finished log.';
    },
    target: () => one(soilLogsLink()),
    done: (c) => c.screen === 'print',
    showMe: async (c) => {
      await acceptOpen(c);
      await tap(soilLogsLink());
    },
  },
  {
    id: 'finished',
    screen: 'print',
    title: 'The finished soil log',
    text: () => 'This is the soil log PDF. Tap Finish to delete this practice job.',
    target: () => one(document.querySelector<HTMLElement>('.sheets .sheet')),
    tipOver: true,
    button: {
      label: 'Finish',
      run: async (c) => {
        await c.store.remove(demoState()!.recordId);
        location.hash = '#/';
      },
    },
  },
  {
    id: 'home-settings',
    screen: 'home',
    title: 'Replay the demo from Settings',
    text: () => "That's the demo. You can replay it any time from Settings.",
    target: () => one(document.querySelector<HTMLElement>('.bar a[href="#/settings"]')),
    button: { label: 'Done' },
  },
];
