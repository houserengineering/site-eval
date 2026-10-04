// Certifier set-up (signature kept on this device only) and the Certify action for perc tests.
import { useEffect, useRef, useState } from 'preact/hooks';
import { certificationState, certify, type CertifierProfile } from '../domain/certify';
import type { FieldRecord } from '../domain/fieldRecord';
import { stopRule } from '../domain/perc';
import { stampText } from '../generator/sitePlan';
import type { RecordStore } from '../storage/db';
import { TextField } from './fields';

export function CertifyPanel(props: { record: FieldRecord; save: (r: FieldRecord) => void; store: RecordStore }) {
  const r = props.record;
  const [me, setMe] = useState<CertifierProfile | null>();
  useEffect(() => {
    props.store.getCertifier().then((p) => setMe(p ?? null), () => setMe(null));
  }, []);
  if (!r.percTests.length) return null;

  const states = r.percTests.map((t) => ({ t, s: certificationState(r, t) }));
  const pending = states.filter((x) => x.s.state !== 'certified');

  const doCertify = () => {
    if (!me) return;
    const incomplete = pending.filter((x) => !stopRule(x.t).met).map((x) => x.t.label);
    const msg = [
      `Apply your signature as ${me.name} to perc test${pending.length === 1 ? '' : 's'} ${pending.map((x) => x.t.label).join(', ')}?`,
      incomplete.length ? `Not complete yet: ${incomplete.join(', ')}.` : '',
      'Any later change to a certified test removes the signature until you certify again.',
    ]
      .filter(Boolean)
      .join('\n\n');
    if (!confirm(msg)) return;
    props.save(
      certify(
        r,
        pending.map((x) => x.t.id),
        me,
      ),
    );
  };

  return (
    <div class="certify">
      <h3>Certification</h3>
      <ul class="cert-list">
        {states.map(({ t, s }) => (
          <li key={t.id}>
            Perc test {t.label}:{' '}
            {s.state === 'certified' ? (
              <strong class="ok-text">
                certified by {s.cert.name}, {stampText(s.cert.at)}
              </strong>
            ) : s.state === 'stale' ? (
              <strong class="warn-text">changed after {s.cert.name} certified it; signature removed until certified again</strong>
            ) : (
              <span class="muted">not certified</span>
            )}
          </li>
        ))}
      </ul>
      {me && pending.length > 0 && (
        <button class="btn primary block" onClick={doCertify}>
          Certify as {me.name}
        </button>
      )}
      {me === null && (
        <p class="hint">
          Signatures are applied only from the certifying engineer's own device. <a href="#/certifier">Set up this device as the certifier</a>
        </p>
      )}
      {me && (
        <p class="hint">
          This device holds {me.name}'s signature. <a href="#/certifier">Change</a>
        </p>
      )}
    </div>
  );
}

export function CertifierSetup(props: { store: RecordStore }) {
  const [p, setP] = useState<CertifierProfile>({ name: '', company: 'Houser Engineering', signaturePng: '' });
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<string>();
  const pad = useRef<SignaturePadHandle>(null);
  useEffect(() => {
    props.store.getCertifier().then((x) => {
      if (x) setP(x);
      setLoaded(true);
    });
  }, []);

  const saveIt = async (e: Event) => {
    e.preventDefault();
    const drawn = pad.current?.png();
    const signaturePng = drawn ?? p.signaturePng;
    if (!p.name.trim() || !signaturePng) return setStatus('Enter the name and draw the signature.');
    await props.store.setCertifier({ ...p, name: p.name.trim(), company: p.company.trim(), signaturePng });
    setP({ ...p, signaturePng });
    pad.current?.clear();
    setStatus('Saved on this device.');
  };
  const removeIt = async () => {
    if (!confirm('Remove the signature from this device?')) return;
    await props.store.setCertifier(undefined);
    setP({ name: '', company: 'Houser Engineering', signaturePng: '' });
    setStatus('Removed from this device.');
  };

  return (
    <main class="page">
      <header class="bar">
        <a class="back" href="#/" onClick={(e) => (history.length > 1 ? (e.preventDefault(), history.back()) : undefined)} aria-label="Back">
          ‹
        </a>
        <h1>Certifier</h1>
      </header>
      <p>
        Set this up only on the certifying engineer's own phone or tablet. The signature stays on this device. It is applied to a perc test only when
        the engineer taps Certify here.
      </p>
      {loaded && (
        <form onSubmit={saveIt}>
          <TextField label="Printed name" value={p.name} onInput={(v) => setP({ ...p, name: v })} autoCapitalize="words" hint="As it appears under the signature." />
          <TextField label="Company" value={p.company} onInput={(v) => setP({ ...p, company: v })} autoCapitalize="words" />
          {p.signaturePng && (
            <div class="field">
              <span class="label">Saved signature</span>
              <img class="sig-saved" src={p.signaturePng} alt="Saved signature" />
            </div>
          )}
          <SignaturePad api={pad} label={p.signaturePng ? 'Draw a new signature (optional)' : 'Signature'} />
          <button class="btn primary block" type="submit">
            Save on this device
          </button>
        </form>
      )}
      {status && (
        <p class="status" role="status">
          {status}
        </p>
      )}
      {p.signaturePng && (
        <section class="danger-zone">
          <button class="btn danger" onClick={removeIt}>
            Remove signature from this device
          </button>
        </section>
      )}
    </main>
  );
}

interface SignaturePadHandle {
  png(): string | undefined;
  clear(): void;
}

function SignaturePad(props: { label: string; api: { current: SignaturePadHandle | null } }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const INK = '#1a237e';
  const W = 4;

  const ctx = () => canvas.current!.getContext('2d')!;
  const pos = (e: PointerEvent) => {
    const c = canvas.current!;
    const rect = c.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) * c.width) / rect.width, y: ((e.clientY - rect.top) * c.height) / rect.height };
  };
  const grow = (x: number, y: number) => {
    const b = box.current;
    box.current = b ? { x0: Math.min(b.x0, x), y0: Math.min(b.y0, y), x1: Math.max(b.x1, x), y1: Math.max(b.y1, y) } : { x0: x, y0: y, x1: x, y1: y };
  };

  const handle: SignaturePadHandle = {
    png() {
      const b = box.current;
      if (!b || !canvas.current) return undefined;
      // Trimmed to the ink so it scales to the signature line.
      const pad = W * 2;
      const x = Math.max(0, Math.floor(b.x0 - pad));
      const y = Math.max(0, Math.floor(b.y0 - pad));
      const w = Math.min(canvas.current.width - x, Math.ceil(b.x1 - b.x0 + 2 * pad));
      const h = Math.min(canvas.current.height - y, Math.ceil(b.y1 - b.y0 + 2 * pad));
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      out.getContext('2d')!.drawImage(canvas.current, x, y, w, h, 0, 0, w, h);
      return out.toDataURL('image/png');
    },
    clear() {
      ctx().clearRect(0, 0, canvas.current!.width, canvas.current!.height);
      box.current = null;
      setHasInk(false);
    },
  };
  props.api.current = handle;

  const down = (e: PointerEvent) => {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    const p = pos(e);
    const c = ctx();
    c.strokeStyle = INK;
    c.lineWidth = W;
    c.lineCap = c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(p.x, p.y);
    c.lineTo(p.x + 0.1, p.y);
    c.stroke();
    grow(p.x, p.y);
    setHasInk(true);
  };
  const move = (e: PointerEvent) => {
    if (!canvas.current!.hasPointerCapture(e.pointerId)) return;
    const p = pos(e);
    ctx().lineTo(p.x, p.y);
    ctx().stroke();
    grow(p.x, p.y);
  };

  return (
    <div class="field">
      <span class="label" id="sig-label">
        {props.label}
      </span>
      <canvas
        ref={canvas}
        class="sig-pad"
        width={900}
        height={300}
        role="img"
        aria-labelledby="sig-label"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={(e) => canvas.current!.releasePointerCapture(e.pointerId)}
      />
      <p class="hint">Sign with a finger or stylus inside the box.</p>
      {hasInk && (
        <button type="button" class="btn small" onClick={() => handle.clear()}>
          Clear
        </button>
      )}
    </div>
  );
}
