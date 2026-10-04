// The demo script (spec 2026-10-03): one step per field group along the field path. Each step names
// the screen it happens on, what to highlight, when the user's own action completes it, a short
// correction for a wrong entry, and "Show me" (the step done through the real controls).
import { updateTestPit, type FieldRecord, type TestPit } from '../../domain/fieldRecord';
import { acceptFlag, openFlags } from '../../domain/pitChecks';
import { pitGroups, wallOf } from '../../domain/pitWalls';
import { missingItems, structureText } from '../../domain/soilLogText';
import type { RecordStore } from '../../storage/db';
import { DEMO_KEY, type DemoHorizon } from '../fieldGuide';
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
  title: string;
  text: (c: Ctx) => string;
  /** The answer key value the tip shows. */
  sample?: string;
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
  /** The tip's own button on steps the user reads (Next, Finish, Done). */
  button?: { label: string; run?: (c: Ctx) => Promise<void> | void };
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

const depthText = (h: DemoHorizon) => `${h.designation}, ${h.topIn}–${h.bottomIn}"`;
const colorKey = (h: DemoHorizon) => `${h.color.hue} ${h.color.value}/${h.color.chroma}`;
const structureKey = (h: DemoHorizon) => [h.structure.grade, h.structure.size, h.structure.shape].join(' ').toLowerCase();

interface Part {
  name: string;
  target: (card: HTMLElement) => (HTMLElement | null)[];
  done: (w: TestPit, i: number) => boolean;
  show: (card: HTMLElement, h: DemoHorizon) => Promise<void>;
}
const hz = (w: TestPit | undefined, i: number) => w?.horizons[i];
const PARTS: Part[] = [
  {
    name: 'horizon and depth',
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
    target: (card) => [field('USDA class', card)],
    done: (w, i) => !!hz(w, i)!.texture.cls.trim(),
    show: (card, h) => pick(card, 'USDA class', h.texture),
  },
  {
    name: 'rock fragments',
    target: (card) => [field('Rock fragments (by volume)', card)],
    done: (w, i) => hz(w, i)!.rock.pct != null && !missingItems(w).horizons[i].some((m) => m.startsWith('rock')),
    show: (card, h) => type(input('Rock fragments (by volume)', card), String(h.rockPct)),
  },
  {
    name: 'structure',
    target: (card) => [field('Structure', card)],
    done: (w, i) => !!structureText(hz(w, i)!),
    show: async (card, h) => {
      await pick(card, 'Shape', h.structure.shape);
      await pick(card, 'Grade', h.structure.grade);
      await pick(card, 'Size', h.structure.size);
    },
  },
  {
    name: 'consistence and plasticity',
    target: (card) => [field('Consistence', card), field('Plasticity', card)],
    done: (w, i) => !!hz(w, i)!.consistence && !!hz(w, i)!.plasticity,
    show: async (card, h) => {
      await pick(card, 'Consistence', h.consistence);
      await pick(card, 'Plasticity', h.plasticity);
    },
  },
  {
    name: 'roots and mottling',
    target: (card) => [field('Roots', card)?.closest('.pair') as HTMLElement],
    done: (w, i) => !missingItems(w).horizons[i].some((m) => m === 'roots' || m.startsWith('mottl')),
    show: async (card, h) => {
      await pick(card, 'Roots', h.roots === 'Y' ? 'Yes' : 'No');
      await pick(card, 'Mottling', h.mottling === 'Y' ? 'Yes' : 'No');
    },
  },
];
const ROCK = 3;

const depthProblem = (w: TestPit | undefined, i: number) => {
  const h = hz(w, i);
  return h && h.bottomIn != null && h.topIn != null && h.bottomIn <= h.topIn ? 'Bottom must be below the top.' : undefined;
};

function horizonStep(i: number, part: Part, title: string, text: string, sample: string): Step {
  return {
    id: `h${i + 1}-${part.name.split(' ')[0]}`,
    screen: 'pitA',
    title,
    text: () => text,
    sample,
    target: () => {
      const card = horizonCard(i + 1);
      return card ? shown(part.target(card)) : [];
    },
    typed: part === PARTS[ROCK],
    done: (c) => !!hz(c.wallA, i) && part.done(c.wallA!, i),
    problem: (c) => depthProblem(c.wallA, i),
    showMe: async () => {
      const card = horizonCard(i + 1);
      if (card) await part.show(card, DEMO_KEY.horizons[i]);
    },
  };
}

const [A1, B2] = DEMO_KEY.horizons;

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
const backLink = () => document.querySelector<HTMLElement>('.bar a.back');

async function acceptOpen(c: Ctx) {
  let r = latest(c);
  for (const f of openFlags(r)) r = acceptFlag(r, f.wallId, f.id, 'Demo');
  if (r !== latest(c)) save(c, r);
  await wait(200);
}

// ---- The script -----------------------------------------------------------------------------------

export const STEPS: Step[] = [
  {
    id: 'welcome',
    screen: 'site',
    title: 'Practice on a made-up job',
    text: () =>
      'About 5 minutes. Each step highlights one field: fill it in and the demo moves on with you. Tap "Show me" to watch it done. Nothing goes to Dropbox, and the demo job deletes itself at the end.',
    button: { label: 'Start' },
  },
  headerStep('project-number', 'Project #', 'projectNumber', 'Project #', 'The job number, a dot, then the subproject.', (v) =>
    /^\d{4}\.\d{3}$/.test(v.trim()) ? undefined : 'Use 4 digits, a dot, then 3 digits, like 0999.001.',
  ),
  headerStep('project-name', 'Project name', 'projectName', 'Project name', 'As it should print on the soil log.'),
  headerStep('location', 'Location', 'location', 'Location', 'Street address or a short description of the site.'),
  {
    id: 'eval-by',
    screen: 'site',
    title: 'Who and when',
    text: () => 'Your name and the day you dug the pits.',
    sample: `${H.evalBy}, today`,
    target: () => shown([field('Eval. by'), field('Date')]),
    typed: true,
    done: (c) => filled(c.r?.header.evalBy) && !!c.r?.header.date,
    showMe: async () => {
      await type(input('Eval. by'), 'Demo Evaluator');
      await type(input('Date'), new Date().toLocaleDateString('en-CA'));
    },
  },
  headerStep(
    'confirmation',
    'Confirmation number',
    'confirmationNumber',
    'Confirmation number',
    "From GCCHD on Gallatin County site evaluations. Leave it blank on other counties' jobs.",
  ),
  {
    id: 'add-pit',
    leaves: true,
    screen: 'site',
    title: 'Add a test pit: only when you are standing at it',
    text: () =>
      'Adding a test pit starts the GPS right there, so do not add one until you are physically at the pit. Type its number (blank uses the next one) and tap Add test pit. Wall A (north) opens.',
    sample: DEMO_KEY.pit,
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
    title: 'GPS starts by itself',
    text: (c) =>
      c.wallA?.location
        ? 'Got it. The fix is saved with the wall.'
        : 'It started when you added the pit and saves the fix once it is within ±10 ft. Indoors, or without location permission, there is no fix: tap "Show me" for a made-up one.',
    target: () => one(gpsCard()),
    done: (c) => !!c.wallA?.location,
    showMe: async (c) => {
      const { lat, lon, accuracyM } = DEMO_KEY.fix;
      save(c, updateTestPit(latest(c), c.wallA!.id, { location: { lat, lon, accuracyM, at: new Date().toISOString() } }));
      await wait(300);
    },
  },
  {
    id: 'gps-retake',
    screen: 'pitA',
    title: 'Recalibrate if it looks wrong',
    text: () => 'If the fix is off, or the accuracy is worse than ±10 ft, stand at the pit and tap Retake GPS. No need now.',
    target: () => one(byText<HTMLElement>('button', 'Retake GPS') ?? gpsCard()),
    button: { label: 'Next' },
  },
  {
    id: 'add-horizon',
    screen: 'pitA',
    title: 'Log the first horizon',
    text: () => 'Tap Add horizon. Each horizon is one layer of the wall, top down.',
    target: () => one(addHorizon()),
    done: (c) => (c.wallA?.horizons.length ?? 0) > 0,
    showMe: () => tap(addHorizon()),
  },
  horizonStep(0, PARTS[0], 'Horizon and depth', 'Pick the horizon, then tap its bottom depth (the top follows the horizon above).', depthText(A1)),
  horizonStep(0, PARTS[1], 'Munsell color', 'Hue, then value, then chroma, as read off the chart.', colorKey(A1)),
  horizonStep(0, PARTS[2], 'Texture', 'The USDA class by feel. "Texture by feel" below walks you through it.', A1.texture.toLowerCase()),
  horizonStep(0, PARTS[3], 'Rock fragments', 'Percent by volume. Over 15% adds a rock word to the texture.', `${A1.rockPct}%`),
  horizonStep(0, PARTS[4], 'Structure', 'Shape, then grade and size.', structureKey(A1)),
  horizonStep(0, PARTS[5], 'Consistence and plasticity', 'Moist consistence, and the 3 mm wire for plasticity.', `${A1.consistence}, ${A1.plasticity}`.toLowerCase()),
  horizonStep(0, PARTS[6], 'Roots and mottling', 'Yes or no for each. Mottling yes asks for the mottles.', `roots ${A1.roots === 'Y' ? 'yes' : 'no'}, mottling no`),
  {
    id: 'h2',
    screen: 'pitA',
    title: 'Horizon 2 on your own',
    text: (c) => {
      const part = nextPart(c.wallA, 1);
      return `Add horizon and log it the same way. ${part ? `Now: ${part.name}.` : (c.wallA?.horizons.length ?? 0) < 2 ? 'Now: Add horizon.' : ''}`;
    },
    sample: `${depthText(B2)}, ${colorKey(B2)}, ${B2.texture.toLowerCase()}, ${B2.rockPct}% rock, ${structureKey(B2)}, friable, non-plastic, no roots, no mottling`,
    target: (c) => {
      if (!hz(c.wallA, 1)) return one(addHorizon());
      const card = horizonCard(2);
      const part = nextPart(c.wallA, 1);
      return card && part ? shown(part.target(card)) : [];
    },
    part: (c) => (hz(c.wallA, 1) ? (nextPart(c.wallA, 1)?.name ?? 'done') : 'add'),
    done: (c) => horizonDone(c.wallA, 1),
    problem: (c) => depthProblem(c.wallA, 1),
    showMe: async (c) => {
      if (!hz(walls(latest(c)).wallA, 1)) await tap(addHorizon());
      const card = horizonCard(2);
      for (const p of PARTS) if (card) await p.show(card, B2);
    },
  },
  {
    id: 'summary',
    screen: 'pitA',
    title: 'Test pit summary',
    text: (c) =>
      c.wallA && missingItems(c.wallA).pit.length
        ? `Still needed: ${missingItems(c.wallA).pit.join(', ')}. Tap the row to open it.`
        : 'This row is what prints for the pit: no water seen, no limiting layer, the slope. A normal pit needs nothing here; tap the row to change any of it.',
    target: () => one(document.querySelector<HTMLElement>('section[aria-label="Test pit summary"] summary')),
    button: { label: 'Next' },
  },
  {
    id: 'photo',
    screen: 'pitA',
    title: 'Photo of the wall',
    text: () => 'Tap Take photo: the camera opens. Square to the wall, surface at the top. "Show me" uses a sample photo.',
    target: () => one(document.querySelector<HTMLElement>('section[aria-labelledby^="photos-"] > .btn-row:last-of-type')),
    done: (c) => (c.wallA?.photos.length ?? 0) > 0,
    showMe: async () => giveFile(photoInput(), await goodPhoto()),
  },
  {
    id: 'to-site',
    leaves: true,
    screen: 'pitA',
    title: 'On to wall B',
    text: () => 'Tap ‹ to go back to the site evaluation.',
    target: () => one(backLink()),
    done: (c) => c.screen !== 'pitA',
    showMe: () => tap(backLink()),
  },
  {
    id: 'open-b',
    leaves: true,
    screen: 'site',
    title: 'Open wall 1B',
    text: () => 'The south wall of the same pit.',
    target: (c) => one(c.wallB ? document.querySelector<HTMLElement>(`a[href$="/pit/${c.wallB.id}"]`) : null),
    done: (c) => c.screen === 'pitB',
    showMe: async (c) => tap(document.querySelector<HTMLElement>(`a[href$="/pit/${c.wallB!.id}"]`)),
  },
  {
    id: 'copy-a',
    screen: 'pitB',
    title: 'Start from wall A',
    text: () => 'Same hole, other side: copy wall A, then change only what differs (usually the depths).',
    target: () => one(byText<HTMLElement>('button', /^Start from wall/)),
    done: (c) => (c.wallB?.horizons.length ?? 0) > 0,
    showMe: () => tap(byText<HTMLElement>('button', /^Start from wall/)),
  },
  {
    id: 'retake',
    screen: 'pitB',
    title: 'A pit check: retake this photo',
    text: () =>
      'The app checks every photo. This one is too dark and blurry, so it holds the soil log. Tap Retake and photograph the wall again. "Show me" swaps in a good one.',
    target: (c) => shown([plantedItem(c)?.querySelector<HTMLElement>('.alert'), plantedItem(c)?.querySelector<HTMLElement>('.btn-row')]),
    done: (c) => !!demoState()?.planted && !plantedPhoto(c),
    showMe: async (c) => giveFile(plantedItem(c)?.querySelector<HTMLInputElement>('input[type="file"]') ?? null, await goodPhoto()),
  },
  {
    id: 'to-site-2',
    leaves: true,
    screen: 'pitB',
    title: 'Back to the site evaluation',
    text: () => 'Tap ‹.',
    target: () => one(backLink()),
    done: (c) => c.screen !== 'pitB',
    showMe: () => tap(backLink()),
  },
  {
    id: 'dropbox',
    screen: 'site',
    title: 'Dropbox: off in the demo',
    text: () =>
      'On a real job you connect Dropbox here once. Then the soil logs, photos and field record file themselves into the project folder, and Print sends them to the office copier. The demo never connects.',
    target: () => one(document.querySelector<HTMLElement>('section[aria-labelledby="dbx"]')),
    button: { label: 'Next' },
  },
  {
    id: 'soil-log',
    leaves: true,
    screen: 'site',
    title: 'Generate the soil log',
    text: (c) =>
      c.r && openFlags(c.r).length
        ? `${openFlags(c.r).length} pit check(s) are still open and hold the soil log: fix or accept them on the wall. "Show me" accepts them.`
        : 'Under Deliverables, tap Soil logs.',
    target: () => one(document.querySelector<HTMLElement>('a[href$="/print/soil-logs"]')),
    done: (c) => c.screen === 'print',
    showMe: async (c) => {
      await acceptOpen(c);
      await tap(document.querySelector<HTMLElement>('a[href$="/print/soil-logs"]'));
    },
  },
  {
    id: 'finished',
    screen: 'print',
    title: 'Your finished soil log',
    text: () => 'Both walls on one page, with the photo and GPS. Print or Save PDF from here. Tap Finish: the demo job is deleted.',
    target: () => one(document.querySelector<HTMLElement>('.sheets .sheet')),
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
    leaves: true,
    screen: 'home',
    title: 'The demo lives in Settings',
    text: () => 'To run it again later, tap Settings.',
    target: () => one(document.querySelector<HTMLElement>('.bar a[href="#/settings"]')),
    done: (c) => c.screen === 'settings',
    showMe: () => tap(document.querySelector<HTMLElement>('.bar a[href="#/settings"]')),
  },
  {
    id: 'replay',
    screen: 'settings',
    title: 'Replay the demo',
    text: () => 'Here, any time. That is the demo done.',
    target: () => one(byText<HTMLElement>('button', 'Replay the demo')?.closest<HTMLElement>('.field') ?? null),
    button: { label: 'Done' },
  },
];
