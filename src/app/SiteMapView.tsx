// Map: Justin's test pit map aligned to real coordinates (works offline: the image lives on the
// device and GPS needs no signal), pits coloured by status, a live "you are here" dot with the
// distance to the nearest unfinished pit, and an online satellite view of the same pins.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { addPitWalls, type FieldRecord, type GpsFix, type LatLon, type TestPit } from '../domain/fieldRecord';
import { bearingText, distanceFt, lonLatToPx, metresPerPx, pxToLonLat } from '../domain/georef';
import { pitStatus, type PitStatus } from '../domain/soilLogText';
import { groupStatus, nextPitNumber, pitGroups } from '../domain/pitWalls';
import type { RecordStore } from '../storage/db';

export const STATUS_TEXT: Record<PitStatus, string> = { 'not-started': 'Not started', 'in-progress': 'In progress', complete: 'Complete' };
const FT_PER_M = 3.28084;

/** Where a pit is shown: its planned spot, else a wall's GPS fix. Both walls are the same hole: one pin. */
const pitPoint = (walls: TestPit[]): LatLon | null => {
  const planned = walls.find((w) => w.planned)?.planned;
  const fixed = walls.find((w) => w.location)?.location;
  return planned ?? (fixed ? { lat: fixed.lat, lon: fixed.lon } : null);
};

type Projection = { size: { w: number; h: number }; toPx: (p: LatLon) => [number, number]; toLatLon: (x: number, y: number) => LatLon; mPerPx: number };

export function SiteMapView(props: { record: FieldRecord; save: (r: FieldRecord) => void; store: RecordStore }) {
  const r = props.record;
  const [online, setOnline] = useState(navigator.onLine);
  const [view, setView] = useState<'map' | 'satellite'>(r.siteMap ? 'map' : 'satellite');
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [gpsError, setGpsError] = useState<string>();
  const [placing, setPlacing] = useState(false);
  const [notice, setNotice] = useState<string>();
  const latest = useRef(r);
  latest.current = r;

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener('online', on);
    addEventListener('offline', off);
    if (!('geolocation' in navigator)) setGpsError('This browser has no GPS access.');
    const id = navigator.geolocation?.watchPosition(
      (pos) => {
        setGpsError(undefined);
        setFix({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracyM: pos.coords.accuracy, at: new Date(pos.timestamp).toISOString() });
      },
      (e) => setGpsError(e.code === e.PERMISSION_DENIED ? 'Location permission is off: allow it to see your position.' : 'Waiting for GPS…'),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => {
      removeEventListener('online', on);
      removeEventListener('offline', off);
      if (id !== undefined) navigator.geolocation.clearWatch(id);
    };
  }, []);

  const addPit = (planned: LatLon, location: GpsFix | null) => {
    const label = nextPitNumber(latest.current.testPits);
    props.save(addPitWalls(latest.current, label, { planned, location }));
    setPlacing(false);
    setNotice(`Added test pit ${label}.`);
  };

  const nearest = useMemo(() => {
    if (!fix) return null;
    const open = pitGroups(r.testPits).filter((g) => groupStatus(g.walls) !== 'complete' && pitPoint(g.walls));
    const best = open
      .map((g) => ({ g, ft: distanceFt(fix, pitPoint(g.walls)!) }))
      .sort((a, b) => a.ft - b.ft)[0];
    return best && { label: best.g.pit, ft: best.ft, dir: bearingText(fix, pitPoint(best.g.walls)!) };
  }, [fix, r.testPits]);

  return (
    <main class="page map-page">
      <header class="bar">
        <a class="back" href={`#/se/${r.id}`} aria-label="Back to site evaluation">
          ‹
        </a>
        <h1>Map</h1>
      </header>

      <div class="seg" role="group" aria-label="Map view">
        <button class={`seg-btn${view === 'map' ? ' on' : ''}`} aria-pressed={view === 'map'} disabled={!r.siteMap} onClick={() => setView('map')}>
          Test pit map
        </button>
        <button class={`seg-btn${view === 'satellite' ? ' on' : ''}`} aria-pressed={view === 'satellite'} onClick={() => setView('satellite')}>
          Satellite
        </button>
      </div>

      <p class="readout" role="status">
        {fix ? (
          <>
            You: ±{Math.round(fix.accuracyM * FT_PER_M)} ft
            {nearest && ` · Test pit ${nearest.label}: ${Math.round(nearest.ft)} ft ${nearest.dir}`}
          </>
        ) : (
          (gpsError ?? 'Waiting for GPS…')
        )}
      </p>

      {view === 'map' && r.siteMap && <JobMap record={r} store={props.store} fix={fix} placing={placing} onPlace={(p) => addPit(p, null)} />}
      {view === 'satellite' &&
        (online ? (
          <SatelliteMap record={r} fix={fix} placing={placing} onPlace={(p) => addPit(p, null)} />
        ) : (
          <p class="hint-warn">Satellite imagery needs a connection. The test pit map works offline.</p>
        ))}

      <ul class="legend" aria-label="Legend">
        {(['not-started', 'in-progress', 'complete'] as PitStatus[]).map((s) => (
          <li key={s}>
            <span class={`pin-dot ${s}`} aria-hidden="true">
              {s === 'complete' ? '✓' : ''}
            </span>
            {STATUS_TEXT[s]}
          </li>
        ))}
        <li>
          <span class="me-dot" aria-hidden="true" />
          You
        </li>
      </ul>

      <h2>Add a test pit not on the map</h2>
      <div class="btn-row">
        <button class="btn" disabled={!fix} onClick={() => fix && addPit({ lat: fix.lat, lon: fix.lon }, fix)}>
          At my location
        </button>
        <button class={`btn${placing ? ' primary' : ''}`} aria-pressed={placing} onClick={() => setPlacing(!placing)}>
          {placing ? 'Tap the map…' : 'Tap on the map'}
        </button>
      </div>
      {notice && (
        <p class="status" role="status">
          {notice}
        </p>
      )}
      {r.siteMap && (
        <p class="hint">
          {r.siteMap.title} aligned to the 2025 orthophotos: {r.siteMap.georef.controlPoints} control points, RMS {r.siteMap.georef.rmsFt} ft, worst {r.siteMap.georef.maxFt} ft.
        </p>
      )}
    </main>
  );
}

function JobMap(props: { record: FieldRecord; store: RecordStore; fix: GpsFix | null; placing: boolean; onPlace: (p: LatLon) => void }) {
  const m = props.record.siteMap!;
  const [url, setUrl] = useState<string>();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    let made: string | undefined;
    props.store.getPhoto(m.imageId).then((b) => {
      if (!live) return;
      if (!b) return setMissing(true);
      setUrl((made = URL.createObjectURL(b)));
    });
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [m.imageId]);
  const proj: Projection = useMemo(
    () => ({
      size: { w: m.width, h: m.height },
      toPx: (p) => lonLatToPx(m.georef, p.lon, p.lat),
      toLatLon: (x, y) => {
        const [lon, lat] = pxToLonLat(m.georef, x, y);
        return { lat, lon };
      },
      mPerPx: metresPerPx(m.georef),
    }),
    [m],
  );
  if (missing) return <p class="alert">The map image is not on this device. Load the job file again.</p>;
  return (
    <PanZoom proj={proj} {...props} label={m.title}>
      {url && <img src={url} width={m.width} height={m.height} alt="" draggable={false} />}
    </PanZoom>
  );
}

// Esri World Imagery (free with attribution); Web Mercator tiles at zoom 18 (~0.4 m/px here).
const Z = 18;
const TILE = 256;
const merc = (p: LatLon): [number, number] => {
  const n = TILE * 2 ** Z;
  const s = Math.sin((p.lat * Math.PI) / 180);
  return [((p.lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
};
const unmerc = (x: number, y: number): LatLon => {
  const n = TILE * 2 ** Z;
  return { lon: (x / n) * 360 - 180, lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI };
};

function SatelliteMap(props: { record: FieldRecord; fix: GpsFix | null; placing: boolean; onPlace: (p: LatLon) => void }) {
  const r = props.record;
  // Extent: the job map's corners, else every pit and the evaluator, plus a margin.
  const pts: LatLon[] = r.siteMap
    ? [
        [0, 0],
        [r.siteMap.width, r.siteMap.height],
      ].map(([x, y]) => {
        const [lon, lat] = pxToLonLat(r.siteMap!.georef, x, y);
        return { lat, lon };
      })
    : (pitGroups(r.testPits).map((g) => pitPoint(g.walls)).filter(Boolean) as LatLon[]);
  if (!pts.length && props.fix) pts.push(props.fix);
  if (!pts.length) return <p class="muted">No pits with a location yet, and no GPS fix.</p>;
  const xy = pts.map(merc);
  const pad = TILE / 2;
  const tx0 = Math.floor((Math.min(...xy.map((p) => p[0])) - pad) / TILE);
  const ty0 = Math.floor((Math.min(...xy.map((p) => p[1])) - pad) / TILE);
  const tx1 = Math.floor((Math.max(...xy.map((p) => p[0])) + pad) / TILE);
  const ty1 = Math.floor((Math.max(...xy.map((p) => p[1])) + pad) / TILE);
  const ox = tx0 * TILE;
  const oy = ty0 * TILE;
  const lat0 = pts[0].lat;
  const proj: Projection = {
    size: { w: (tx1 - tx0 + 1) * TILE, h: (ty1 - ty0 + 1) * TILE },
    toPx: (p) => {
      const [x, y] = merc(p);
      return [x - ox, y - oy];
    },
    toLatLon: (x, y) => unmerc(x + ox, y + oy),
    mPerPx: (156_543.034 * Math.cos((lat0 * Math.PI) / 180)) / 2 ** Z,
  };
  const tiles = [];
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++)
      tiles.push(
        <img
          key={`${tx}/${ty}`}
          src={`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z}/${ty}/${tx}`}
          width={TILE}
          height={TILE}
          style={{ position: 'absolute', left: `${(tx - tx0) * TILE}px`, top: `${(ty - ty0) * TILE}px` }}
          alt=""
          draggable={false}
          crossOrigin="anonymous"
        />,
      );
  return (
    <>
      <PanZoom proj={proj} {...props} label="Satellite">
        {tiles}
      </PanZoom>
      <p class="hint">Imagery © Esri, Maxar, Earthstar Geographics.</p>
    </>
  );
}

/** One-finger pan, pinch or wheel zoom; pins and the GPS dot stay a constant size above the image. */
function PanZoom(props: {
  proj: Projection;
  record: FieldRecord;
  fix: GpsFix | null;
  placing: boolean;
  onPlace: (p: LatLon) => void;
  label: string;
  children: preact.ComponentChildren;
}) {
  const { proj, record: r } = props;
  const box = useRef<HTMLDivElement>(null);
  const [t, setT] = useState<{ s: number; x: number; y: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: number; start: number } | null>(null);

  const fit = () => {
    const el = box.current!;
    const s = Math.min(el.clientWidth / proj.size.w, el.clientHeight / proj.size.h);
    setT({ s, x: (el.clientWidth - proj.size.w * s) / 2, y: (el.clientHeight - proj.size.h * s) / 2 });
  };
  useEffect(fit, [proj.size.w, proj.size.h]);

  const zoomAt = (k: number, cx: number, cy: number) =>
    setT((t) => {
      if (!t) return t;
      const s = Math.min(8, Math.max(0.05, t.s * k));
      const kk = s / t.s;
      return { s, x: cx - (cx - t.x) * kk, y: cy - (cy - t.y) * kk };
    });
  const local = (e: PointerEvent | WheelEvent) => {
    const b = box.current!.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };

  const down = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('.pin')) return;
    box.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    gesture.current = pointers.current.size === 1 ? { moved: 0, start: Date.now() } : null;
  };
  const move = (e: PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId).map(([, v]) => v);
    if (others.length === 1) {
      const o = others[0];
      const d0 = Math.hypot(prev.x - o.x, prev.y - o.y);
      const d1 = Math.hypot(p.x - o.x, p.y - o.y);
      if (d0 > 0) zoomAt(d1 / d0, (p.x + o.x) / 2, (p.y + o.y) / 2);
    } else setT((t) => t && { ...t, x: t.x + p.x - prev.x, y: t.y + p.y - prev.y });
    if (gesture.current) gesture.current.moved += Math.hypot(p.x - prev.x, p.y - prev.y);
    pointers.current.set(e.pointerId, p);
  };
  const up = (e: PointerEvent) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    gesture.current = null;
    if (g && g.moved < 8 && Date.now() - g.start < 600 && props.placing && t) {
      const p = local(e);
      props.onPlace(proj.toLatLon((p.x - t.x) / t.s, (p.y - t.y) / t.s));
    }
  };

  const center = () => {
    if (!props.fix || !t) return;
    const el = box.current!;
    const [x, y] = proj.toPx(props.fix);
    setT({ ...t, x: el.clientWidth / 2 - x * t.s, y: el.clientHeight / 2 - y * t.s });
  };
  // Zoomed out, pins a few metres apart would overlap: draw them smaller (the tap target stays).
  const compact = !!t && t.s / proj.mPerPx < 1.5;
  const screen = (p: LatLon) => {
    const [x, y] = proj.toPx(p);
    return t ? [t.x + x * t.s, t.y + y * t.s] : [0, 0];
  };

  return (
    <div class="map-wrap">
      <div
        ref={box}
        class={`map-box${props.placing ? ' placing' : ''}`}
        // The box takes the map's shape (within limits) so the whole map shows without dead bands.
        style={{ aspectRatio: `${proj.size.w} / ${proj.size.h}` }}
        role="application"
        aria-label={`${props.label}. Drag to move, pinch to zoom.`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={(e) => {
          // A cancelled touch (system gesture, palm) is never a tap.
          pointers.current.delete(e.pointerId);
          gesture.current = null;
        }}
        onWheel={(e) => {
          e.preventDefault();
          const p = local(e);
          zoomAt(e.deltaY < 0 ? 1.25 : 0.8, p.x, p.y);
        }}
      >
        {t && (
          <div class="map-content" style={{ width: `${proj.size.w}px`, height: `${proj.size.h}px`, transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})` }}>
            {props.children}
          </div>
        )}
        {t && props.fix && (() => {
          const [x, y] = screen(props.fix);
          const rad = Math.max(8, (props.fix.accuracyM / proj.mPerPx) * t.s);
          return (
            <>
              <span class="me-acc" style={{ left: `${x}px`, top: `${y}px`, width: `${2 * rad}px`, height: `${2 * rad}px` }} aria-hidden="true" />
              <span class="me-dot" style={{ left: `${x}px`, top: `${y}px`, position: 'absolute' }} aria-hidden="true" />
            </>
          );
        })()}
        {t &&
          pitGroups(r.testPits).map((g) => {
            const at = pitPoint(g.walls);
            if (!at) return null;
            const [x, y] = screen(at);
            const s = groupStatus(g.walls);
            // Opens the first wall still to log (wall A on a new pit).
            const wall = g.walls.find((w) => pitStatus(w) !== 'complete') ?? g.walls[0];
            return (
              <a
                key={g.pit}
                class={`pin ${s}${compact ? ' compact' : ''}`}
                style={{ left: `${x}px`, top: `${y}px` }}
                href={`#/se/${r.id}/pit/${wall.id}`}
                aria-label={`Test pit ${g.pit}, ${STATUS_TEXT[s].toLowerCase()}`}
              >
                <span class="pin-dot">{g.pit}</span>
                {s === 'complete' && <span class="pin-badge">✓</span>}
              </a>
            );
          })}
      </div>
      <div class="map-tools">
        <button class="btn" aria-label="Zoom in" onClick={() => zoomAt(1.5, box.current!.clientWidth / 2, box.current!.clientHeight / 2)}>
          +
        </button>
        <button class="btn" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.5, box.current!.clientWidth / 2, box.current!.clientHeight / 2)}>
          −
        </button>
        <button class="btn" onClick={fit}>
          Fit
        </button>
        <button class="btn" onClick={center} disabled={!props.fix}>
          Me
        </button>
      </div>
    </div>
  );
}
