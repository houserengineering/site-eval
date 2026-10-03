// PDF writer for the page model (pdf-lib, standard fonts: Times for the Times New Roman soil log,
// Helvetica for the Calibri perc form).
import { clip, endPath, LineCapStyle, PDFDocument, popGraphicsState, pushGraphicsState, rectangle, rgb, StandardFonts, type PDFFont, type PDFImage } from 'pdf-lib';
import { printable, type FontKey, type Measure, type Page } from './page';

const FONTS: Record<FontKey, StandardFonts> = {
  serif: StandardFonts.TimesRoman,
  'serif-bold': StandardFonts.TimesRomanBold,
  sans: StandardFonts.Helvetica,
  'sans-bold': StandardFonts.HelveticaBold,
};

async function embedFonts(doc: PDFDocument): Promise<Record<FontKey, PDFFont>> {
  const entries = await Promise.all(Object.entries(FONTS).map(async ([k, f]) => [k, await doc.embedFont(f)] as const));
  return Object.fromEntries(entries) as Record<FontKey, PDFFont>;
}

let measurer: Promise<Measure> | undefined;
/**
 * Measures with the same font programs the PDF uses. Glyph by glyph: pdf-lib's whole-string width
 * subtracts kerning pairs, but the text is drawn unkerned, so all-caps lines printed wider than
 * measured and could run over a cell's border.
 */
export function pdfMeasure(): Promise<Measure> {
  measurer ??= PDFDocument.create()
    .then(embedFonts)
    .then((fonts) => {
      const widths = new Map<string, number>();
      const glyph = (font: FontKey, ch: string) => {
        const key = font + ch;
        let w = widths.get(key);
        if (w === undefined) widths.set(key, (w = fonts[font].widthOfTextAtSize(ch, 1000) / 1000));
        return w;
      };
      return (text, font, size) => {
        let w = 0;
        for (const ch of printable(text)) w += glyph(font, ch);
        return w * size;
      };
    });
  return measurer;
}

const color = (hex = '#000000') => {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

export async function writePdf(pages: Page[], meta: { title: string; subject?: string; date: Date }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(meta.title);
  doc.setAuthor('Houser Engineering');
  if (meta.subject) doc.setSubject(meta.subject);
  doc.setCreator('Houser Engineering site evaluation app');
  doc.setProducer('pdf-lib');
  doc.setCreationDate(meta.date);
  doc.setModificationDate(meta.date);
  const fonts = await embedFonts(doc);
  const images = new Map<Uint8Array, PDFImage>();

  for (const p of pages) {
    const page = doc.addPage([p.w, p.h]);
    const Y = (y: number) => p.h - y;
    for (const op of p.ops) {
      // Field text can hold any character; the standard fonts take WinAnsi only.
      if (op.k === 'text') page.drawText(printable(op.text), { x: op.x, y: Y(op.y), size: op.size, font: fonts[op.font], color: color(op.color) });
      else if (op.k === 'line')
        page.drawLine({
          start: { x: op.x1, y: Y(op.y1) },
          end: { x: op.x2, y: Y(op.y2) },
          thickness: op.w,
          color: color(op.color),
          dashArray: op.dash,
          lineCap: op.dash ? undefined : LineCapStyle.Projecting,
        });
      else if (op.k === 'rect')
        page.drawRectangle({
          x: op.x,
          y: Y(op.y + op.h),
          width: op.w,
          height: op.h,
          borderWidth: op.stroke ?? 0,
          borderColor: op.stroke ? color(op.color) : undefined,
          color: op.fill ? color(op.fill) : undefined,
        });
      else if (op.k === 'circle')
        page.drawCircle({
          x: op.x,
          y: Y(op.y),
          size: op.r,
          borderWidth: op.stroke ?? 0,
          borderColor: op.stroke ? color() : undefined,
          borderDashArray: op.dash,
          color: op.fill ? color(op.fill) : undefined,
        });
      else if (op.k === 'image') {
        let img = images.get(op.bytes);
        if (!img) {
          img = op.mime === 'image/png' ? await doc.embedPng(op.bytes) : await doc.embedJpg(op.bytes);
          images.set(op.bytes, img);
        }
        if (op.clip) page.pushOperators(pushGraphicsState(), rectangle(op.clip.x, Y(op.clip.y + op.clip.h), op.clip.w, op.clip.h), clip(), endPath());
        page.drawImage(img, { x: op.x, y: Y(op.y + op.h), width: op.w, height: op.h });
        if (op.clip) page.pushOperators(popGraphicsState());
      }
    }
  }
  return doc.save();
}
