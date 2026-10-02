// Test pit photos (camera, stored on device) and GPS fix with accuracy and retake.
import { useEffect, useRef, useState } from 'preact/hooks';
import { updateTestPit, type FieldRecord, type GpsFix, type PhotoRef, type TestPit } from '../domain/fieldRecord';
import { accuracyFt, fixText, stampText } from '../generator/sitePlan';
import type { RecordStore } from '../storage/db';
import { needsAutoFix, wallLocation } from '../domain/pitWalls';
import { locationCaption } from '../generator/locationPanel';

/** County site evaluations locate each test pit within 10 ft. */
const COUNTY_FT = 10;
const FT_PER_M = 3.28084;

export function PitMedia(props: { record: FieldRecord; pit: TestPit; save: (r: FieldRecord) => void; store: RecordStore }) {
  // Photo encoding and GPS fixes finish after later edits; they must apply to the latest record.
  const latest = useRef(props.record);
  latest.current = props.record;
  const patchPit = (patch: (pit: TestPit) => Partial<Omit<TestPit, 'id'>>) => {
    const r = latest.current;
    const pit = r.testPits.find((p) => p.id === props.pit.id);
    if (pit) props.save((latest.current = updateTestPit(r, pit.id, patch(pit))));
  };
  return (
    <>
      <PitPhotos {...props} patchPit={patchPit} />
      <PitLocation {...props} patchPit={patchPit} />
    </>
  );
}

/** Downscales a camera photo (EXIF orientation applied) to a JPEG the PDFs and sync can carry. */
async function shrink(file: Blob, max = 1600): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * k);
  const height = Math.round(bmp.height * k);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const blob = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('Could not encode the photo'))), 'image/jpeg', 0.85));
  return { blob, width, height };
}

type PatchPit = (patch: (pit: TestPit) => Partial<Omit<TestPit, 'id'>>) => void;
type Props = Parameters<typeof PitMedia>[0] & { patchPit: PatchPit };

function PitPhotos({ record, pit, store, patchPit }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string>();
  const ids = pit.photos.map((p) => p.id).join(',');

  useEffect(() => {
    let live = true;
    const made: string[] = [];
    Promise.all(pit.photos.map(async (p) => [p.id, await store.getPhoto(p.id)] as const)).then((rows) => {
      if (!live) return;
      const next: Record<string, string> = {};
      for (const [id, blob] of rows)
        if (blob) {
          next[id] = URL.createObjectURL(blob);
          made.push(next[id]);
        }
      setUrls(next);
    });
    return () => {
      live = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [ids]);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setStatus('Saving photo…');
    try {
      const refs: PhotoRef[] = [];
      for (const file of Array.from(files)) {
        const { blob, width, height } = await shrink(file);
        const id = crypto.randomUUID();
        await store.putPhoto(id, record.id, blob);
        refs.push({ id, takenAt: new Date(file.lastModified || Date.now()).toISOString(), width, height });
      }
      patchPit((p) => ({ photos: [...p.photos, ...refs] }));
      setStatus(`${refs.length} photo${refs.length === 1 ? '' : 's'} saved on this device.`);
    } catch (e: any) {
      setStatus(`Photo not saved: ${e.message}`);
    }
  };

  // Cleared after each pick so choosing the same photo again still fires.
  const picked = (input: HTMLInputElement) => void add(input.files).finally(() => (input.value = ''));

  const remove = async (id: string, n: number) => {
    if (!confirm(`Delete photo ${n}?`)) return;
    patchPit((p) => ({ photos: p.photos.filter((x) => x.id !== id) }));
    await store.removePhoto(id);
  };
  const useOnLog = (id: string) => {
    patchPit((p) => ({ photos: [...p.photos.filter((x) => x.id === id), ...p.photos.filter((x) => x.id !== id)] }));
  };

  return (
    <section class="card" aria-labelledby={`photos-${pit.id}`}>
      <h2 id={`photos-${pit.id}`}>Photos</h2>
      {pit.photos.length === 0 && <p class="muted">No photo yet. The first photo prints on the soil log.</p>}
      <ul class="photos">
        {pit.photos.map((p, i) => (
          <li key={p.id}>
            {urls[p.id] ? <img src={urls[p.id]} alt={`Test pit ${pit.label} photo ${i + 1}`} /> : <div class="photo-missing">Not on this device</div>}
            <span class="row-sub">
              {i === 0 ? 'On the soil log · ' : ''}
              {stampText(p.takenAt)}
            </span>
            <div class="btn-row">
              {i > 0 && (
                <button class="btn small" onClick={() => useOnLog(p.id)}>
                  Use on soil log
                </button>
              )}
              <button class="btn small danger" onClick={() => remove(p.id, i + 1)} aria-label={`Delete photo ${i + 1}`}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div class="btn-row">
        <label class="btn primary">
          Take photo
          <input class="visually-hidden" type="file" accept="image/*" capture="environment" onChange={(e) => picked(e.currentTarget)} />
        </label>
        <label class="btn">
          From gallery
          <input class="visually-hidden" type="file" accept="image/*" multiple onChange={(e) => picked(e.currentTarget)} />
        </label>
      </div>
      {status && (
        <p class="status" role="status">
          {status}
        </p>
      )}
    </section>
  );
}

/** A fix still short of the county's accuracy is kept after this long rather than waiting on. */
const FIX_TIMEOUT_MS = 90_000;

function PitLocation({ record, pit, patchPit }: Props) {
  const [best, setBest] = useState<GpsFix | null>(null);
  const [error, setError] = useState<string>();
  const [watching, setWatching] = useState(false);
  const watch = useRef<number | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const stop = () => {
    if (watch.current !== undefined) navigator.geolocation.clearWatch(watch.current);
    clearTimeout(timer.current);
    watch.current = undefined;
    setWatching(false);
  };
  useEffect(() => {
    if (needsAutoFix(pit)) start();
    return stop;
  }, [pit.id]);

  const accept = (fix: GpsFix) => {
    stop();
    setBest(null);
    patchPit(() => ({ location: fix }));
  };

  const start = () => {
    if (!('geolocation' in navigator)) return setError('This browser has no GPS access.');
    setError(undefined);
    setBest(null);
    setWatching(true);
    let top: GpsFix | null = null;
    timer.current = setTimeout(() => {
      if (top) accept(top);
      else {
        stop();
        setError('No GPS fix yet. Try again in open sky.');
      }
    }, FIX_TIMEOUT_MS);
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        const fix = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracyM: pos.coords.accuracy, at: new Date(pos.timestamp).toISOString() };
        if (!top || fix.accuracyM <= top.accuracyM) top = fix;
        setBest(top);
        // Good enough for the county: keep it without another tap.
        if (top.accuracyM * FT_PER_M <= COUNTY_FT) accept(top);
      },
      (e) => {
        stop();
        setError(e.code === e.PERMISSION_DENIED ? 'Location permission is off for this site. Allow it in the browser settings, then try again.' : `No GPS fix: ${e.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 120_000 },
    );
  };

  const fix = pit.location;
  const over = fix && accuracyFt(fix) > COUNTY_FT;
  const onLog = wallLocation(pit, record.testPits);
  return (
    <section class="card" aria-labelledby={`gps-${pit.id}`}>
      <h2 id={`gps-${pit.id}`}>GPS location</h2>
      {fix ? (
        <p class="readout">
          {fixText(fix)}
          <span class="row-sub">Captured {stampText(fix.at)}</span>
        </p>
      ) : (
        !watching && <p class="muted">Not recorded. Stand at the pit and capture.</p>
      )}
      {onLog && <p class="hint">Location on the log: {locationCaption(onLog)}</p>}
      {over && !watching && <p class="hint-warn">Accuracy is over the county's {COUNTY_FT} ft. Retake in open sky if you can.</p>}
      {watching && (
        <div role="status" class="gps-live">
          {best ? (
            <>
              <p>
                Best so far <strong>±{accuracyFt(best)} ft</strong>. Waiting for ±{COUNTY_FT} ft or better…
              </p>
              <button class="btn primary block" onClick={() => accept(best)}>
                Use this fix (±{accuracyFt(best)} ft)
              </button>
            </>
          ) : (
            <p>Getting a GPS fix…</p>
          )}
          <button class="btn block" onClick={stop}>
            Cancel
          </button>
        </div>
      )}
      {!watching && (
        <button class={`btn block${fix ? '' : ' primary'}`} onClick={start}>
          {fix ? 'Retake GPS' : 'Capture GPS'}
        </button>
      )}
      {error && (
        <p class="alert" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
