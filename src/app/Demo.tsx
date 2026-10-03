// Interactive demo (Nathan, 2026-10-03): a guided walkthrough on a synthetic sample job. The demo
// record is marked `demo`, never syncs or files to Dropbox, and is deleted from the guide's last step.
import { useEffect, useState } from 'preact/hooks';
import { newSiteEvaluation, type FieldRecord, type TestPit } from '../domain/fieldRecord';
import { wallFlags } from '../domain/pitChecks';
import type { RecordStore } from '../storage/db';
import { go } from './App';

const STEP_KEY = 'site-eval:demo-step';
const today = () => new Date().toLocaleDateString('en-CA');

/** A new demo evaluation: made-up header, no client data. */
export async function startDemo(store: RecordStore) {
  const r: FieldRecord = {
    ...newSiteEvaluation({
      projectName: 'Demo Ranch (sample, not a real job)',
      location: '1 Sample Road',
      evalBy: 'Demo Evaluator',
      date: today(),
      ownerName: 'Sample Owner',
    }),
    demo: true,
  };
  await store.save(r);
  save(0);
  go(`#/se/${r.id}`);
}

function load(): number {
  try {
    return Number(localStorage.getItem(STEP_KEY)) || 0;
  } catch {
    return 0;
  }
}
function save(step: number) {
  try {
    localStorage.setItem(STEP_KEY, String(step));
  } catch {}
}

const firstPit = (r: FieldRecord) => r.testPits[0]?.label.replace(/[AB]$/i, '');
const wall = (r: FieldRecord, side: 'A' | 'B'): TestPit | undefined => r.testPits.find((p) => p.label.toUpperCase() === `${firstPit(r)}${side}`);
const logged = (w?: TestPit) => (w?.horizons ?? []).filter((h) => h.bottomIn != null && h.texture.cls && (h.color.hue || h.color.other)).length;

interface Step {
  title: string;
  body: (r: FieldRecord) => string;
  done: (r: FieldRecord, hash: string) => boolean;
}

const STEPS: Step[] = [
  {
    title: 'Welcome',
    body: () =>
      'This is a made-up job to practice on. Nothing here goes to Dropbox or the office printer, and your real site evaluations are not touched. Tap Next to start.',
    done: () => false,
  },
  {
    title: 'Add a test pit',
    body: () => 'Scroll to "New test pit #", type 1 and tap Add test pit. Each pit gets two walls, A (north) and B (south), and wall A opens.',
    done: (r) => r.testPits.length > 0,
  },
  {
    title: 'Log the horizons',
    body: () =>
      'Tap Add horizon. Pick the horizon (O, A, B…), the bottom depth, the Munsell color and the USDA texture. Add at least two horizons; the soil log preview under each one shows what will print.',
    done: (r) => logged(wall(r, 'A')) >= 2,
  },
  {
    title: 'Add a photo',
    body: () => 'Under Photos, tap Take photo (or From gallery). In the demo you can tap "Use a sample photo" instead.',
    done: (r) => (wall(r, 'A')?.photos.length ?? 0) > 0,
  },
  {
    title: 'Wall B',
    body: (r) => `Go back and open "Wall ${firstPit(r) ?? '1'}B, south". Tap "Start from wall ${firstPit(r) ?? '1'}A" to copy its horizons, then change what differs.`,
    done: (r) => logged(wall(r, 'B')) >= 1,
  },
  {
    title: 'Pit checks',
    body: () =>
      'Pit checks are the problems that hold the soil log: depth gaps, a missing color or texture, walls A and B that disagree, a photo to retake. They show on the wall under Pit checks; fix each one, or accept it if it does not apply. The "to fill" badge on a horizon only counts fields still blank.',
    done: (r) => [wall(r, 'A'), wall(r, 'B')].every((w) => w && w.horizons.length && !wallFlags(r, w).some((f) => !f.accepted)),
  },
  {
    title: 'Generate the soil log',
    body: () => 'Go back to the site evaluation. Under Deliverables, tap Soil logs to see the printed log.',
    done: (_, hash) => hash.includes('/print/'),
  },
  {
    title: 'Done',
    body: () =>
      'That is the whole loop. On a real job, connect Dropbox on the site evaluation and the logs file themselves into the project folder. Delete the demo when you are finished.',
    done: () => false,
  },
];

/** The guide panel, shown on every screen of the demo evaluation. */
export function DemoGuide(props: { record: FieldRecord; store: RecordStore }) {
  const r = props.record;
  const [step, setStep] = useState(load);
  const [hash, setHash] = useState(location.hash);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  const to = (n: number) => {
    const next = Math.max(0, Math.min(STEPS.length - 1, n));
    save(next);
    setStep(next);
  };
  const s = STEPS[step];
  const done = s.done(r, hash);
  // Navigation steps move on by themselves; data steps wait for Next so the user sees it ticked.
  useEffect(() => {
    if (done && s.title === 'Generate the soil log') to(step + 1);
  }, [done, step]);

  const remove = async () => {
    if (!confirm('Delete the demo site evaluation?')) return;
    await props.store.remove(r.id);
    save(0);
    go('#/');
  };

  if (!open)
    return (
      <button type="button" class="demo-pill" onClick={() => setOpen(true)}>
        Demo guide · step {step + 1} of {STEPS.length}
      </button>
    );
  return (
    <aside class="demo-guide" aria-label="Demo guide">
      <div class="demo-head">
        <p class="demo-step">
          Demo · step {step + 1} of {STEPS.length}
        </p>
        <button type="button" class="btn small" onClick={() => setOpen(false)}>
          Hide
        </button>
      </div>
      <h2>
        {s.title} {done && <span class="badge ok">Done</span>}
      </h2>
      <p>{s.body(r)}</p>
      <div class="btn-row">
        {step > 0 && (
          <button type="button" class="btn small" onClick={() => to(step - 1)}>
            Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" class={`btn small${done || step === 0 ? ' primary' : ''}`} onClick={() => to(step + 1)}>
            {done || step === 0 ? 'Next' : 'Skip'}
          </button>
        ) : (
          <button type="button" class="btn small danger" onClick={remove}>
            Delete the demo
          </button>
        )}
      </div>
    </aside>
  );
}

/** A synthetic pit-wall photo for the demo: soil bands with texture and a white card. */
export async function samplePhoto(): Promise<File> {
  const w = 1200;
  const h = 1600;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const bands: [number, string][] = [
    [0, '#3b2f25'],
    [0.14, '#4a3a2b'],
    [0.32, '#7a6248'],
    [1, '#7a6248'],
  ];
  for (let i = 0; i < bands.length - 1; i++) {
    g.fillStyle = bands[i][1];
    g.fillRect(0, bands[i][0] * h, w, (bands[i + 1][0] - bands[i][0]) * h + 1);
  }
  // Grain and stones, so the photo checks see a sharp image.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40000; i++) {
    const v = Math.floor(rnd() * 80) - 40;
    g.fillStyle = `rgba(${v > 0 ? '255,255,255' : '0,0,0'},${Math.abs(v) / 160})`;
    g.fillRect(rnd() * w, rnd() * h, 3, 3);
  }
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `rgb(${140 + rnd() * 60},${130 + rnd() * 50},${110 + rnd() * 40})`;
    g.beginPath();
    g.ellipse(rnd() * w, h * (0.35 + rnd() * 0.65), 8 + rnd() * 30, 6 + rnd() * 20, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#f4f4f0';
  g.fillRect(w * 0.7, h * 0.05, w * 0.2, h * 0.1);
  const blob: Blob = await new Promise((ok) => c.toBlob((b) => ok(b!), 'image/jpeg', 0.9));
  return new File([blob], 'demo-pit-wall.jpg', { type: 'image/jpeg', lastModified: Date.now() });
}
