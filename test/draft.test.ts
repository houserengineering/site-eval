import { describe, expect, it } from 'vitest';
import { draftShown, tapeShown, type Draft } from '../src/app/draft';

describe('tape field inches shown', () => {
  it('keeps what was typed while the save is still on its way (ticket 14: 18" recorded as 0")', () => {
    // Typed 18 into a blank field; the record has not caught up yet.
    expect(tapeShown({ text: '18', base: null }, null)).toBe('18');
  });
  it('keeps the typed text once the record agrees', () => {
    expect(tapeShown({ text: '18', base: null }, 18)).toBe('18');
    expect(tapeShown({ text: '18', base: null }, 18.5)).toBe('18');
  });
  it('follows a change made elsewhere (other device, carried forward)', () => {
    expect(tapeShown({ text: '18', base: null }, 12)).toBe('12');
    expect(tapeShown({ text: '18', base: 18 }, null)).toBe('');
  });
  it('shows the record when nothing was typed', () => {
    expect(tapeShown({ text: '', base: null }, 16.25)).toBe('16');
    expect(tapeShown({ text: '', base: null }, null)).toBe('');
  });
});

describe('number field shown', () => {
  const parse = (t: string) => (t.trim() === '' ? null : Number(t));
  const shown = (d: Draft, v: number | null) => draftShown(d, v, parse(d.text) === v, v == null ? '' : String(v));
  it('keeps "5." on the way to 5.5 and a value not yet saved', () => {
    expect(shown({ text: '5.', base: 5 }, 5)).toBe('5.');
    expect(shown({ text: '22', base: 2 }, 2)).toBe('22');
  });
  it('follows a change made elsewhere', () => {
    expect(shown({ text: '22', base: 2 }, 30)).toBe('30');
  });
});
