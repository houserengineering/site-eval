// Finding the demo's targets on the real screens, and "Show me": doing a step with visible taps and
// typing through the same controls the user would use.

/** The field (or fieldset) whose label, chip-group label or legend reads exactly `label`. */
export function field(label: string, scope: ParentNode = document): HTMLElement | null {
  for (const el of scope.querySelectorAll<HTMLElement>('label, .label, legend, .field-label'))
    if (el.textContent?.trim() === label) return el.closest<HTMLElement>('fieldset, .field') ?? el;
  return null;
}

export const input = (label: string, scope: ParentNode = document) => field(label, scope)?.querySelector<HTMLInputElement>('input') ?? null;

/** Horizon card n (1-based), opened if collapsed so its fields can be highlighted. */
export function horizonCard(n: number): HTMLElement | null {
  const card = document.querySelector<HTMLElement>(`section[aria-label="Horizon ${n}"]`);
  const details = card?.querySelector('details');
  if (details && !details.open) details.open = true;
  return card;
}

export function byText<T extends HTMLElement>(selector: string, text: string | RegExp, scope: ParentNode = document): T | null {
  for (const el of scope.querySelectorAll<T>(selector)) {
    const t = el.textContent?.trim() ?? '';
    if (typeof text === 'string' ? t === text : text.test(t)) return el;
  }
  return null;
}

/** The visible, laid-out ones only (a collapsed card's fields have no box). */
export const shown = (els: (Element | null | undefined)[]) => els.filter((e): e is HTMLElement => !!e && e.getClientRects().length > 0);

// ---- Show me --------------------------------------------------------------------------------------

let pace = 1;
/** 0 makes Show me instant (reduced motion, or Skip step filling the step in). */
export const setPace = (p: number) => (pace = p);
const frame = () => new Promise((ok) => requestAnimationFrame(() => ok(undefined)));
export const wait = async (ms: number) => {
  if (pace && ms) await new Promise((ok) => setTimeout(ok, ms * pace));
  await frame();
  await frame();
};

/** A ripple where the finger would be (no click). */
export async function touch(el: HTMLElement | null) {
  if (!el || !pace) return;
  el.scrollIntoView({ block: 'nearest' });
  await wait(450);
  const r = el.getBoundingClientRect();
  const dot = document.createElement('span');
  dot.className = 'coach-touch';
  dot.style.left = `${r.left + r.width / 2}px`;
  dot.style.top = `${r.top + r.height / 2}px`;
  document.body.append(dot);
  setTimeout(() => dot.remove(), 600);
  await wait(500);
}

/** A tap: the ripple, then a click. */
export async function tap(el: HTMLElement | null) {
  if (!el) return;
  await touch(el);
  el.click();
  await wait(700);
}

/** Types into a text box as the user would (input events), then commits it (change). */
export async function type(el: HTMLInputElement | null, text: string) {
  if (!el) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await touch(el);
  if (el.type === 'date' || !pace) {
    setter.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else
    for (let i = 1; i <= text.length; i++) {
      setter.call(el, text.slice(0, i));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(110);
    }
  el.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(700);
}

/** Taps a chip in a chip group unless it is already picked. */
export async function pick(scope: ParentNode | null, group: string, option: string) {
  const f = scope && field(group, scope);
  const chip = f && byText<HTMLButtonElement>('[role="radio"]', option, f);
  if (chip && chip.getAttribute('aria-checked') !== 'true') await tap(chip);
}

/** Hands a picture to a camera/gallery file input, as picking it would. */
export async function giveFile(el: HTMLInputElement | null, file: File) {
  if (!el) return;
  await touch(el.closest('label') ?? el.parentElement);
  const dt = new DataTransfer();
  dt.items.add(file);
  el.files = dt.files;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(800);
}

export async function fetchFile(url: string, name: string): Promise<File> {
  const blob = await (await fetch(url)).blob();
  return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
}
