// Munsell hue mis-tap guard. On 0271 two horizons were logged 2.5YR and 10R where every other
// horizon of that kind on the site was 10YR or 2.5Y. A hue not used on the same horizon elsewhere
// on the site is worth a second look; the evaluator can keep it with one tap.
import type { Horizon, TestPit } from './fieldRecord';

const key = (h: Horizon) => h.designation.trim().toUpperCase();

/** The warning for horizon `h`'s matrix hue, or undefined when it fits the site (or was kept). */
export function hueWarning(pits: TestPit[], h: Horizon): string | undefined {
  const hue = h.color.hue;
  if (!hue || h.color.keptHue === hue) return undefined;
  const others = pits.flatMap((p) => p.horizons).filter((x) => x.id !== h.id && x.color.hue && (!key(h) || key(x) === key(h)));
  const hues = [...new Set(others.map((x) => x.color.hue))];
  if (!hues.length || hues.includes(hue)) return undefined;
  const where = key(h) ? `on other ${key(h)} horizons` : 'elsewhere';
  return `${hue} is not used ${where} on this site (${hues.join(', ')}). Check the chip.`;
}
