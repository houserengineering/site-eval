// Print preview: the PDF deliverable's own pages drawn as SVG, one letter sheet per page, for the
// system print dialog (Android Chrome prints the page, not a PDF file). Save PDF writes the file.
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { FieldRecord } from '../domain/fieldRecord';
import type { DeliverableKind, Page, PrintKind } from '../generator';
import type { FontKey } from '../generator/page';
import type { RecordStore } from '../storage/db';
import { download, photoSource } from './deliverables';
import { loadTemplates } from './templates';
import { UnconfirmedNotice } from './Unconfirmed';

export const PRINT_KINDS: Record<PrintKind, { title: string; file: DeliverableKind }> = {
  'soil-logs': { title: 'Soil logs', file: 'soil-log-pdf' },
  'perc-tests': { title: 'Perc tests', file: 'perc-test-pdf' },
  'site-evaluation': { title: 'Site evaluation', file: 'site-evaluation-pdf' },
  groundwater: { title: 'Groundwater observation results', file: 'groundwater-pdf' },
};

const FAMILY: Record<FontKey, [string, string]> = {
  serif: ["'Times New Roman', Tinos, 'Liberation Serif', 'Noto Serif', serif", 'normal'],
  'serif-bold': ["'Times New Roman', Tinos, 'Liberation Serif', 'Noto Serif', serif", 'bold'],
  sans: ["Helvetica, Arial, 'Liberation Sans', Roboto, sans-serif", 'normal'],
  'sans-bold': ["Helvetica, Arial, 'Liberation Sans', Roboto, sans-serif", 'bold'],
};

export function PrintView(props: { record: FieldRecord; kind: PrintKind; store: RecordStore; save: (r: FieldRecord) => void }) {
  const r = props.record;
  const meta = PRINT_KINDS[props.kind];
  const [pages, setPages] = useState<Page[]>();
  const [status, setStatus] = useState<string>();
  const back = props.kind === 'groundwater' ? `#/se/${r.id}/gw` : `#/se/${r.id}`;

  useEffect(() => {
    let live = true;
    (async () => {
      const [{ printPages, forDeliverables }, templates] = await Promise.all([import('../generator'), loadTemplates()]);
      const all = await printPages(forDeliverables(r), templates, { photo: photoSource(props.store) });
      if (live) setPages(all[props.kind]);
    })().catch((e) => live && setStatus(`Could not build the pages: ${e.message}`));
    return () => void (live = false);
  }, [r.updatedAt, props.kind]);

  const savePdf = async () => {
    setStatus('Writing PDF…');
    try {
      const { generate } = await import('../generator');
      const f = (await generate(r, await loadTemplates(), { photo: photoSource(props.store) })).find((x) => x.kind === meta.file);
      if (!f) return setStatus('Nothing to save yet.');
      const name = [r.header.projectNumber, f.path].filter(Boolean).join(' ');
      download(new Blob([f.bytes as BlobPart], { type: f.mimeType }), name);
      setStatus(`Saved ${name}`);
    } catch (e: any) {
      setStatus(`PDF failed: ${e.message}`);
    }
  };

  return (
    <div class="print-view">
      <div class="page no-print">
        <header class="bar">
          <a class="back" href={back} aria-label="Back to site evaluation">
            ‹
          </a>
          <h1>Print {meta.title.toLowerCase()}</h1>
        </header>
        <div class="btn-row">
          <button class="btn primary" onClick={() => print()} disabled={!pages?.length}>
            Print…
          </button>
          <button class="btn" onClick={savePdf} disabled={!pages?.length}>
            Save PDF
          </button>
        </div>
        <UnconfirmedNotice record={r} save={props.save} context="preview" />
        <p class="hint">Letter paper{pages?.some((p) => p.w > p.h) ? ', landscape' : ''}, scale 100% (Default). On the office Wi-Fi, pick the office copier in the print dialog.</p>
        {status && (
          <p class="status" role="status">
            {status}
          </p>
        )}
        {pages === undefined && !status && <p class="muted">Laying out pages…</p>}
        {pages?.length === 0 && <p class="muted">Nothing to print yet.</p>}
        {pages && pages.length > 0 && (
          <p class="muted">
            {pages.length} page{pages.length === 1 ? '' : 's'}
          </p>
        )}
      </div>
      <div class="sheets">
        {pages?.map((p, i) => (
          <SheetSvg key={i} page={p} label={`${meta.title} page ${i + 1} of ${pages.length}`} />
        ))}
      </div>
    </div>
  );
}

function SheetSvg({ page, label }: { page: Page; label: string }) {
  // One object URL per image for the life of the sheet.
  const urls = useMemo(
    () => new Map(page.ops.flatMap((o) => (o.k === 'image' ? [[o.bytes, URL.createObjectURL(new Blob([o.bytes as BlobPart], { type: o.mime }))] as const] : []))),
    [page],
  );
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return (
    <svg class={`sheet${page.w > page.h ? ' landscape' : ''}`} viewBox={`0 0 ${page.w} ${page.h}`} role="img" aria-label={label} xmlns="http://www.w3.org/2000/svg">
      <rect width={page.w} height={page.h} fill="#ffffff" />
      {page.ops.map((o, i) => {
        if (o.k === 'text') {
          const [family, weight] = FAMILY[o.font];
          return (
            <text
              key={i}
              x={o.x}
              y={o.y}
              font-size={o.size}
              font-family={family}
              font-weight={weight}
              fill={o.color ?? '#000000'}
              textLength={o.w > 0 ? o.w : undefined}
              lengthAdjust="spacingAndGlyphs"
              style="white-space: pre"
            >
              {o.text}
            </text>
          );
        }
        if (o.k === 'line')
          return (
            <line
              key={i}
              x1={o.x1}
              y1={o.y1}
              x2={o.x2}
              y2={o.y2}
              stroke={o.color ?? '#000000'}
              stroke-width={o.w}
              stroke-dasharray={o.dash?.join(' ')}
              stroke-linecap={o.dash ? 'butt' : 'square'}
            />
          );
        if (o.k === 'rect')
          return <rect key={i} x={o.x} y={o.y} width={o.w} height={o.h} fill={o.fill ?? 'none'} stroke={o.stroke ? (o.color ?? '#000000') : 'none'} stroke-width={o.stroke} />;
        if (o.k === 'circle')
          return <circle key={i} cx={o.x} cy={o.y} r={o.r} fill={o.fill ?? 'none'} stroke={o.stroke ? '#000000' : 'none'} stroke-width={o.stroke} stroke-dasharray={o.dash?.join(' ')} />;
        return <image key={i} href={urls.get(o.bytes)} x={o.x} y={o.y} width={o.w} height={o.h} preserveAspectRatio="none" />;
      })}
    </svg>
  );
}
