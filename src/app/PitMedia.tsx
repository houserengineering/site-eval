// Test pit photos (camera, stored on device) and GPS fix with accuracy and retake.
import { useEffect, useRef, useState } from 'preact/hooks';
import { updateTestPit, type FieldRecord, type PhotoRef, type TestPit } from '../domain/fieldRecord';
import { accuracyFt, fixText, stampText } from '../generator/sitePlan';
import type { RecordStore } from '../storage/db';
import { needsAutoFix, wallLocation, wallOf } from '../domain/pitWalls';
import { locationCaption } from '../generator/locationPanel';
import { lumaOf, measurePhoto, photoProblemText, photoProblems, type PhotoQuality } from '../domain/pitChecks';
import { measureColor, type PhotoColor } from '../domain/photoColor';
import { COUNTY_FT, keepBestFix, registerSaver, startFix, stopFix, useCapture } from './gps';


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
      <PitLocation {...props} patchPit={patchPit} />
      <PitPhotos {...props} patchPit={patchPit} />
    </>
  );
}

/**
 * Downscales a camera photo (EXIF orientation applied) to a JPEG the PDFs and sync can carry, and
 * measures it against the photo minimum standard (domain/pitChecks.ts) and for the color check
 * (domain/photoColor.ts) on a ≤ 512 px copy.
 */
async function shrink(file: Blob, max = 1600): Promise<{ blob: Blob; width: number; height: number; quality: PhotoQuality; color: PhotoColor }> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { quality, color } = measure(bmp);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * k);
  const height = Math.round(bmp.height * k);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const blob = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('Could not encode the photo'))), 'image/jpeg', 0.85));
  return { blob, width, height, quality, color };
}

/** Shrinks, measures and stores one photo on this device; the wall's photo list is the caller's. */
export async function storePhoto(store: RecordStore, recordId: string, file: File): Promise<PhotoRef> {
  const { blob, width, height, quality, color } = await shrink(file);
  const id = crypto.randomUUID();
  await store.putPhoto(id, recordId, blob);
  return { id, takenAt: new Date(file.lastModified || Date.now()).toISOString(), width, height, quality, color };
}

function measure(bmp: ImageBitmap): { quality: PhotoQuality; color: PhotoColor } {
  const k = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
  const w = Math.max(3, Math.round(bmp.width * k));
  const h = Math.max(3, Math.round(bmp.height * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return { quality: measurePhoto(lumaOf(data), w, h, { width: bmp.width, height: bmp.height }), color: measureColor(data, w, h) };
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

  /** Saves picked photos; `retake` replaces that photo in its place. */
  const add = async (files: FileList | File[] | null, retake?: string) => {
    if (!files?.length) return;
    setStatus('Saving photo…');
    try {
      const refs: PhotoRef[] = [];
      for (const file of Array.from(files)) refs.push(await storePhoto(store, record.id, file));
      patchPit((p) => {
        const at = retake ? p.photos.findIndex((x) => x.id === retake) : -1;
        return { photos: at < 0 ? [...p.photos, ...refs] : [...p.photos.slice(0, at), ...refs, ...p.photos.slice(at + 1)] };
      });
      if (retake) await store.removePhoto(retake);
      const bad = refs.filter((x) => photoProblems(x.quality!).length).length;
      setStatus(bad ? `Saved, but ${bad === refs.length ? (refs.length === 1 ? 'it does' : 'they do') : `${bad} of ${refs.length} do`} not meet the photo standard. Retake ${bad === 1 ? 'it' : 'them'}.` : `${refs.length} photo${refs.length === 1 ? '' : 's'} saved on this device.`);
    } catch (e: any) {
      setStatus(`Photo not saved: ${e.message}`);
    }
  };

  // Cleared after each pick so choosing the same photo again still fires.
  const picked = (input: HTMLInputElement, retake?: string) => void add(input.files, retake).finally(() => (input.value = ''));

  const remove = async (id: string, n: number) => {
    if (!confirm(`Delete photo ${n}?`)) return;
    patchPit((p) => ({ photos: p.photos.filter((x) => x.id !== id) }));
    await store.removePhoto(id);
  };
  /** One wall-face photo per wall: marking one unmarks the others. */
  const markFace = (id: string, face: boolean) => {
    patchPit((p) => ({ photos: p.photos.map((x) => ({ ...x, face: x.id === id ? face : face ? false : x.face })) }));
  };
  const markWhite = (id: string, whiteInFrame: boolean) => {
    patchPit((p) => ({ photos: p.photos.map((x) => (x.id === id ? { ...x, whiteInFrame } : x)) }));
  };
  const useOnLog = (id: string) => {
    patchPit((p) => ({ photos: [...p.photos.filter((x) => x.id === id), ...p.photos.filter((x) => x.id !== id)] }));
  };

  return (
    <section class="card" aria-labelledby={`photos-${pit.id}`}>
      <h2 id={`photos-${pit.id}`}>Photos</h2>
      {pit.photos.length === 0 && <p class="muted">No photo yet. The first photo goes on the soil log.</p>}
      <p class="muted">For the color check, take one photo square to the wall, surface at the top edge and log bottom at the bottom, and mark it Wall face.</p>
      <ul class="photos">
        {pit.photos.map((p, i) => (
          <li key={p.id}>
            {urls[p.id] ? <img src={urls[p.id]} alt={`Test pit ${pit.label} photo ${i + 1}`} /> : <div class="photo-missing">Not on this device</div>}
            <span class="row-sub">
              {i === 0 ? 'On the soil log · ' : ''}
              {stampText(p.takenAt)}
            </span>
            {p.quality && photoProblems(p.quality).length > 0 && <p class="alert">This photo is {photoProblemText(p.quality)}. Retake it.</p>}
            {p.color && (
              <label class="toggle">
                <input type="checkbox" checked={!!p.face} onChange={(e) => markFace(p.id, e.currentTarget.checked)} />
                Wall face (color check)
              </label>
            )}
            {p.face && (
              <label class="toggle">
                <input type="checkbox" checked={!!p.whiteInFrame} onChange={(e) => markWhite(p.id, e.currentTarget.checked)} />
                White card or tape in frame
              </label>
            )}
            <div class="btn-row">
              {p.quality && photoProblems(p.quality).length > 0 && (
                <label class="btn small primary">
                  Retake
                  <input class="visually-hidden" type="file" accept="image/*" capture="environment" aria-label={`Retake photo ${i + 1}`} onChange={(e) => picked(e.currentTarget, p.id)} />
                </label>
              )}
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

function PitLocation({ record, pit, patchPit }: Props) {
  const capture = useCapture(pit.id);
  const watching = !!capture?.watching;
  const best = capture?.best;
  const error = capture?.error;
  // The open screen saves the fix itself, so it lands on the record being edited here.
  useEffect(() => registerSaver(pit.id, (fix) => patchPit(() => ({ location: fix }))), [pit.id]);
  // A wall opened before its pit got a fix (an older job, or the capture stopped): start now.
  useEffect(() => {
    if (needsAutoFix(pit) && !capture) startFix(record.id, pit.id);
  }, [pit.id]);
  const start = () => startFix(record.id, pit.id);
  const stop = () => stopFix(pit.id);
  const accept = () => keepBestFix(pit.id);

  const fix = pit.location;
  const over = fix && accuracyFt(fix) > COUNTY_FT;
  const onLog = wallLocation(pit, record.testPits);
  // The other wall of this hole has the fix: this wall uses it.
  const shared = !fix && onLog?.source === 'other-wall' ? record.testPits.find((p) => p !== pit && p.location && wallOf(p.label).pit === wallOf(pit.label).pit)?.label : undefined;
  return (
    <section class="card" aria-labelledby={`gps-${pit.id}`}>
      <h2 id={`gps-${pit.id}`}>GPS location</h2>
      {fix ? (
        <p class="readout">
          {fixText(fix)}
          <span class="row-sub">Captured {stampText(fix.at)}</span>
        </p>
      ) : (
        !watching &&
        (shared ? (
          <p class="muted">This wall uses the GPS location of wall {shared}, the other wall of the same hole.</p>
        ) : (
          <p class="muted">No fix yet. Stand at the pit and tap Capture GPS.</p>
        ))
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
              <button class="btn primary block" onClick={accept}>
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
        <button class={`btn block${fix || shared ? '' : ' primary'}`} onClick={start}>
          {fix ? 'Retake GPS' : shared ? 'Capture GPS for this wall' : 'Capture GPS'}
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

