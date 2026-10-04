// Coach marks for the demo (spec 2026-10-03, decisions 1, 5, 8, 9): the screen dims except the
// highlighted field, which is scrolled into view; the tip sits above or below it with an arrow, never
// over it; taps outside the highlight are blocked; the step completes on the user's own action.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { RecordStore } from '../../storage/db';
import { useAnimate } from '../settings';
import { setPace } from './dom';
import { GAP, placeTip, scrollToFit, unionRect, type Box, type Side } from './placement';
import { demoState, markDemoDone, removeDemoRecords, setDemoState, useDemo } from './state';
import { SCREEN_NAMES, STEPS, hashFor, onStepScreen, screenOf, walls, type Ctx } from './steps';

/** The highlight's margin around its field; the tip lines up with the highlight's edges. */
const PAD = 8;
const EDGE = 8;
const ATTR = 'data-coach-target';

export function Coach(props: { store: RecordStore }) {
  const { state, live } = useDemo();
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  if (!state || !STEPS[state.step]) return null;
  const r = live?.record;
  const ctx: Ctx = { r, live, screen: screenOf(hash, r, state.recordId), ...walls(r), store: props.store };
  return <CoachView ctx={ctx} index={state.step} replay={state.replay} store={props.store} />;
}

/** The visible screen, less the sticky title bar unless the target is in it. */
const viewBox = (els: HTMLElement[] = []): Box => {
  const v = visualViewport;
  const box = v ? { top: v.offsetTop, left: v.offsetLeft, width: v.width, height: v.height } : { top: 0, left: 0, width: innerWidth, height: innerHeight };
  const bar = document.querySelector('.bar');
  if (!bar || els.some((e) => bar.contains(e))) return box;
  const under = Math.max(box.top, bar.getBoundingClientRect().bottom);
  return { ...box, top: under, height: box.height - (under - box.top) };
};
/**
 * Typing in the step's field: the on-screen keyboard is up (or about to be). Not read from the visual
 * viewport alone: some phone browsers report the keyboard late or not at all.
 */
const TYPED = new Set(['text', 'number', 'tel', 'search', 'email', 'url', 'password']);
let typingIn: Element | null = null;
let keyboardSeen = false;
const typingInTarget = () => {
  const a = document.activeElement;
  if (!((a instanceof HTMLTextAreaElement || (a instanceof HTMLInputElement && TYPED.has(a.type))) && a.closest(`[${ATTR}]`))) return false;
  if (a !== typingIn) [typingIn, keyboardSeen] = [a, false];
  const up = !!visualViewport && visualViewport.height < innerHeight * 0.8;
  if (up) keyboardSeen = true;
  // The keyboard reported and then closed (Android's back button keeps the focus): not typing.
  return up || !keyboardSeen;
};
const same = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5);
const focusInTarget = () => !!document.activeElement?.closest(`[${ATTR}]`);
/** A text box in the highlight has the focus: the typing is not committed yet (a tapped chip keeps the focus too, but is done). */
const textFocusInTarget = () => {
  const a = document.activeElement;
  return (a instanceof HTMLTextAreaElement || (a instanceof HTMLInputElement && TYPED.has(a.type))) && !!a.closest(`[${ATTR}]`);
};
/**
 * ready: the user's turn. busy: Show me or a button is working. shown: Show me finished and the step is
 * about to complete (its buttons stay hidden, so they do not flash). done: completed, moving on.
 */
type Phase = 'ready' | 'busy' | 'shown' | 'done';
/** Off the step's screen just after a step change: the navigation is still landing, so no tip yet. */
const SETTLE_MS = 1200;

function CoachView(props: { ctx: Ctx; index: number; replay: boolean; store: RecordStore }) {
  const { ctx, index } = props;
  const step = STEPS[index];
  const animate = useAnimate();
  const onScreen = onStepScreen(step, ctx.screen);
  const key = stepKey(step, ctx);
  const [box, setBox] = useState<(Box & { step: string }) | null>(null);
  const [view, setView] = useState<Box>(() => viewBox());
  const [tipH, setTipH] = useState(200);
  const [prefer, setPrefer] = useState<Side>('below');
  // The phase belongs to its step: a new step starts ready, with no frame of the last step's phase.
  const [ph, setPh] = useState<{ i: number; p: Phase }>({ i: index, p: 'ready' });
  const phase: Phase = ph.i === index ? ph.p : 'ready';
  const setPhase = (p: Phase) => setPh({ i: index, p });
  const changedAt = useRef({ index, at: Date.now() });
  if (changedAt.current.index !== index) changedAt.current = { index, at: Date.now() };
  const [, setTick] = useState(0);
  const [glide, setGlide] = useState(false);
  const lastInput = useRef(0);
  const scrolledFor = useRef<string>('');
  const [backs, setBacks] = useState(0);
  const live = useRef({ ctx, step, onScreen });
  live.current = { ctx, step, onScreen };
  const bump = () => setTick((n) => n + 1);

  // A new step: ready again, glide to its field, scroll to it once.
  useEffect(() => {
    scrolledFor.current = '';
    if (!animate) return;
    setGlide(true);
    const t = setTimeout(() => setGlide(false), 450);
    return () => clearTimeout(t);
  }, [index]);

  // Follow the target every frame (it moves as the user scrolls, types and the screen re-renders), and
  // at once when the visible screen changes (the keyboard opening or closing).
  const tipEl = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let raf = 0;
    let marked: HTMLElement[] = [];
    const update = () => {
      const { ctx, step, onScreen } = live.current;
      const els = onScreen && step.target ? step.target(ctx) : [];
      for (const el of marked) if (!els.includes(el)) el.removeAttribute(ATTR);
      for (const el of els) el.setAttribute(ATTR, step.id);
      marked = els;
      // Keyboard up in a group of fields: highlight just the one being typed in, with its label, so it
      // and its tip fit in the room over the keyboard.
      const active = document.activeElement;
      const typing = typingInTarget() && active instanceof HTMLElement && els.some((e) => e.contains(active)) ? [active, ...((active as HTMLInputElement).labels ?? [])] : null;
      const next = els.length ? pad(unionRect((typing ?? els).map((e) => e.getBoundingClientRect()))) : null;
      const key = stepKey(step, ctx);
      setBox((b) => (same(b, next) && b?.step === key ? b : next && { ...next, step: key }));
      const v = viewBox(els);
      // Typing with the keyboard not (yet) reported: assume it takes the bottom half.
      if (typingInTarget() && visualViewport && visualViewport.height > innerHeight * 0.8) v.height = Math.min(v.height, innerHeight * 0.5 - (v.top - visualViewport.offsetTop));
      setView((o) => (same(o, v) ? o : v));
      setPrefer(typingInTarget() ? 'above' : 'below');
      // Its full height, even while it scrolls inside a short room.
      if (tipEl.current) setTipH(tipEl.current.scrollHeight);
    };
    const loop = () => {
      update();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const vv = visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      for (const el of marked) el.removeAttribute(ATTR);
    };
  }, []);

  // Scroll the field into view with room for its tip, once per step and screen height (so again when
  // the keyboard opens or closes) and on "Take me back". The tip can grow after that (a correction,
  // the next part of horizon 2): scroll again if it no longer fits beside the field. Waits for the
  // screen to settle (the keyboard slides in over several frames).
  const scrolledTipH = useRef(0);
  // Not on every change of the screen height: the address bar slides in and out as the user scrolls, and
  // re-scrolling then fights them. Only while typing, when the keyboard settles.
  // Re-anchored too when the user taps into the field.
  const scrollKey = `${key}|${prefer}|${focusInTarget() ? 'focus' : ''}${prefer === 'above' ? `|${Math.round(view.height)}` : ''}`;
  // One timer at a time, not reset by the box moving under it (it moves every frame while anything on
  // the screen animates); it reads the latest box, room and key when it fires.
  const latestFit = useRef({ box, tipH, view, prefer, scrollKey, key });
  latestFit.current = { box, tipH, view, prefer, scrollKey, key };
  const pending = useRef(false);
  const lastScroll = useRef(0);
  const userScroll = useRef(0);
  // Show me scrolls to each control it taps: no re-anchoring meanwhile.
  const busy = useRef(false);
  busy.current = phase === 'busy' || phase === 'shown';
  useEffect(() => {
    const on = () => (userScroll.current = Date.now());
    const opts = { passive: true, capture: true };
    for (const t of ['touchmove', 'wheel'] as const) addEventListener(t, on, opts);
    return () => {
      for (const t of ['touchmove', 'wheel'] as const) removeEventListener(t, on, opts);
    };
  }, []);
  const needsScroll = () => {
    const { box, tipH, view, prefer, scrollKey, key } = latestFit.current;
    if (!box || box.step !== key) return false;
    const short = placeTip(box, { width: 420, height: tipH }, view, prefer, live.current.step.tipOver).height < tipH;
    // Off the screen without the user scrolling it there (the page grew or shrank around it): back to it.
    const gone = box.top + box.height < view.top || box.top > view.top + view.height;
    const moved = gone && !busy.current && Date.now() - userScroll.current > 1500 && Date.now() - lastScroll.current > 600;
    return moved || scrolledFor.current !== scrollKey || (short && tipH !== scrolledTipH.current);
  };
  useEffect(() => {
    // The box lags a step change by a frame: wait for this step's.
    if (!onScreen || pending.current || !needsScroll()) return;
    pending.current = true;
    // Just scrolled: let the box catch up with it before measuring again.
    const wait = Math.max(150, 300 - (Date.now() - lastScroll.current));
    setTimeout(() => {
      pending.current = false;
      if (!needsScroll()) return;
      const { box, tipH, view, prefer, scrollKey } = latestFit.current;
      scrolledFor.current = scrollKey;
      scrolledTipH.current = tipH;
      // Typing: the field near the top of the screen, its one-line tip just above it, so it stays clear
      // of the keyboard whatever its height.
      const d = prefer === 'above' ? Math.round(box!.top - (view.top + EDGE + tipH + GAP)) : scrollToFit(box!, tipH, view, prefer);
      if (Math.abs(d) < 4) return;
      const smooth = animate && prefer === 'below';
      lastScroll.current = Date.now() + (smooth ? 400 : 0);
      scrollBy({ top: d, behavior: smooth ? 'smooth' : 'auto' });
      setTimeout(bump, smooth ? 700 : 300);
    }, wait);
  }, [box, tipH, view, prefer, onScreen, scrollKey, backs]);

  // Typing, committing, focus moves: re-check the step. Enter on a highlighted field commits it.
  useEffect(() => {
    const onInput = () => {
      lastInput.current = Date.now();
      bump();
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === 'Enter' && t.closest(`[${ATTR}]`) && t instanceof HTMLInputElement && !t.form) t.blur();
    };
    document.addEventListener('input', onInput, true);
    document.addEventListener('focusin', bump, true);
    document.addEventListener('focusout', bump, true);
    document.addEventListener('keydown', onKey, true);
    const t = setInterval(bump, 500);
    return () => {
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('focusin', bump, true);
      document.removeEventListener('focusout', bump, true);
      document.removeEventListener('keydown', onKey, true);
      clearInterval(t);
    };
  }, []);

  const advance = () => {
    if (index + 1 >= STEPS.length) {
      markDemoDone();
      setDemoState(null);
    } else setDemoState({ ...demoState()!, step: index + 1 });
  };
  const complete = async () => {
    setPhase('done');
    await step.after?.(live.current.ctx);
    setTimeout(advance, animate ? 650 : 250);
  };

  // The user's own action completes the step.
  const valid = !!step.done && (onScreen || !!step.leaves) && step.done(ctx);
  useEffect(() => {
    if ((phase === 'ready' || phase === 'shown') && valid && (!step.typed || !textFocusInTarget())) void complete();
  });

  const showMe = async () => {
    setPhase('busy');
    setPace(animate ? 1 : 0);
    try {
      await step.showMe!(live.current.ctx);
    } finally {
      // Not straight back to ready: the step completes on the next render, and ready would show its
      // buttons for a moment first. Back to ready only if it did not complete (a typed field left open).
      setPhase('shown');
      (document.activeElement as HTMLElement | null)?.blur?.();
      bump();
      setTimeout(() => setPh((cur) => (cur.i === index && cur.p === 'shown' ? { i: index, p: 'ready' } : cur)), 1500);
    }
  };
  const skip = async () => {
    setPhase('busy');
    setPace(0);
    try {
      if (step.showMe && onScreen) await step.showMe(live.current.ctx);
      await step.button?.run?.(live.current.ctx);
    } finally {
      void complete();
    }
  };
  const press = async () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    setPhase('busy');
    await step.button?.run?.(live.current.ctx);
    void complete();
  };
  const exit = async () => {
    setDemoState(null);
    await removeDemoRecords(props.store);
    location.hash = '#/';
  };
  // A replay ends on the phone's back button (Nathan, 2026-10-04): the tip has no Exit button. Not
  // popstate: Chromium fires it for every hash change, the app's own included. The Navigation API tells a
  // back or forward ('traverse') from a new navigation. The first run has to be finished once ("Take me
  // back" covers wandering off).
  useEffect(() => {
    const nav = (window as { navigation?: EventTarget }).navigation;
    if (!props.replay || !nav) return;
    const on = (e: Event) => {
      if ((e as Event & { navigationType?: string }).navigationType === 'traverse') void exit();
    };
    nav.addEventListener('navigate', on);
    return () => nav.removeEventListener('navigate', on);
  }, [props.replay]);

  // A practice job has no wall to photograph: a tap on the highlighted Take photo, From gallery or Retake
  // puts in the sample photo (Show me) instead of opening the camera.
  const runShowMe = useRef(showMe);
  runShowMe.current = showMe;
  useEffect(() => {
    if (!step.samplePhoto) return;
    const on = (e: MouseEvent) => {
      const label = (e.target as Element | null)?.closest?.('label');
      if (!label?.querySelector('input[type="file"]') || !label.closest(`[${ATTR}]`)) return;
      e.preventDefault();
      e.stopPropagation();
      if (live.current.step.samplePhoto) void runShowMe.current();
    };
    document.addEventListener('click', on, true);
    return () => document.removeEventListener('click', on, true);
  }, [index]);
  const takeBack = () => {
    scrolledFor.current = '';
    const h = hashFor(step.screen, ctx);
    if (!onScreen && h) location.hash = h;
    setBacks((n) => n + 1);
  };

  // Off the step's screen because the step is done or Show me is moving on: no "Take me back" flash.
  if (ctx.screen === 'loading' || (!onScreen && (phase !== 'ready' || valid || Date.now() - changedAt.current.at < SETTLE_MS))) return null;
  const offscreen = !!box && (box.top + box.height < view.top || box.top > view.top + view.height);
  const hole = onScreen && box && !offscreen ? onScreenBox(box) : null;
  const typedNext = step.typed && valid && phase === 'ready';
  const problem = onScreen ? step.problem?.(ctx) : undefined;
  const sample = typeof step.sample === 'function' ? step.sample(ctx) : step.sample;
  // Keyboard up on this step's field: the tip shrinks to one line.
  const compact = prefer === 'above' && !!hole;
  const showProblem = problem && phase === 'ready' && (!focusInTarget() || Date.now() - lastInput.current > 1200);
  const place = hole
    ? placeTip(hole, { width: 420, height: tipH }, view, prefer, step.tipOver)
    : { side: 'none' as const, top: view.top + Math.max(8, (view.height - tipH) / 2), left: view.left + 16, width: Math.min(420, view.width - 32), height: Math.min(tipH, view.height - 16), arrowLeft: 0, maxHeight: view.height - 16 };
  if (!hole) place.left = view.left + (view.width - place.width) / 2;
  // Scrolled away from the field: a one-line chip at the edge toward it, not a card in the way.
  const away = onScreen && offscreen && phase === 'ready' ? (box!.top < view.top ? 'above' : 'below') : null;
  if (away) place.top = away === 'above' ? view.top + EDGE : view.top + view.height - EDGE - Math.min(tipH, 72);

  return (
    <div class={`coach${glide ? ' glide' : ''}${phase === 'done' ? ' is-done' : ''}`}>
      {hole ? (
        <>
          <div class="coach-hole" data-coach-hole style={css(hole)} />
          <div class="coach-block" style={css({ top: 0, left: 0, width: innerWidth, height: Math.max(0, hole.top) })} />
          <div class="coach-block" style={css({ top: hole.top + hole.height, left: 0, width: innerWidth, height: Math.max(0, innerHeight - hole.top - hole.height) })} />
          <div class="coach-block" style={css({ top: hole.top, left: 0, width: Math.max(0, hole.left), height: hole.height })} />
          <div class="coach-block" style={css({ top: hole.top, left: hole.left + hole.width, width: Math.max(0, innerWidth - hole.left - hole.width), height: hole.height })} />
        </>
      ) : (
        <div class="coach-block dim" />
      )}
      {hole && place.side !== 'over' && (
        <span
          class="coach-arrow"
          aria-hidden="true"
          style={{ left: `${place.left + place.arrowLeft}px`, top: `${place.side === 'below' ? place.top - 7 : place.top + place.height - 9}px` }}
        />
      )}
      <div
        ref={tipEl}
        class={`coach-tip ${place.side}${compact || away ? ' compact' : ''}`}
        data-coach-tip
        role="dialog"
        aria-label="Demo guide"
        style={{ top: `${place.top}px`, left: `${place.left}px`, width: `${place.width}px`, maxHeight: `${place.maxHeight}px` }}
      >
        <h2 class="visually-hidden">{onScreen ? step.title : 'You left the demo step'}</h2>
        {away ? (
          <div class="coach-line">
            <p>Field {away} {away === 'above' ? '↑' : '↓'}</p>
            <button type="button" class="btn small primary" onClick={takeBack}>
              Take me back
            </button>
          </div>
        ) : compact ? (
          // Keyboard up: one line, so the field and the keyboard keep the room.
          <div class="coach-line">
            <p class={showProblem ? 'coach-problem' : undefined} role={showProblem ? 'alert' : undefined}>
              {showProblem ? problem : sample ? <>e.g. <strong>{sample}</strong></> : step.text(ctx)}
            </p>
            {typedNext && (
              <button type="button" class="btn small primary" onClick={() => void complete()}>
                Next
              </button>
            )}
          </div>
        ) : (
          <>
            <p>
              {onScreen ? step.text(ctx) : `This step is on ${SCREEN_NAMES[step.screen]}.`}
              {onScreen && sample && (
                <span class="coach-sample">
                  , e.g. <strong>{sample}</strong>.
                </span>
              )}
              {phase === 'done' && <span class="coach-check"> ✓</span>}
            </p>
            {onScreen && step.image && <img class="coach-image" src={step.image} alt="A good photo of a test pit wall, ground surface at the top" />}
            {showProblem && (
              <p class="coach-problem" role="alert">
                {problem}
              </p>
            )}
            <div class={`coach-actions${phase === 'ready' ? '' : ' is-waiting'}`}>
              {(!onScreen || offscreen) && (
                <button type="button" class="btn small primary" onClick={takeBack}>
                  Take me back
                </button>
              )}
              {onScreen && !offscreen && step.button && (
                <button type="button" class="btn small primary" onClick={press} disabled={phase !== 'ready'}>
                  {step.button.label}
                </button>
              )}
              {onScreen && !offscreen && typedNext && (
                <button type="button" class="btn small primary" onClick={() => void complete()}>
                  Next
                </button>
              )}
              {onScreen && !offscreen && step.showMe && !valid && (
                <button type="button" class={`btn small${step.button || typedNext ? '' : ' primary'}`} onClick={showMe} disabled={phase !== 'ready'}>
                  Show me
                </button>
              )}
              {!step.button && (
                <button type="button" class="link-btn" onClick={skip} disabled={phase !== 'ready'}>
                  Skip
                </button>
              )}
              <span class="coach-count">
                {index + 1}/{STEPS.length}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const pad = (b: Box): Box => ({ top: b.top - PAD, left: b.left - PAD, width: b.width + 2 * PAD, height: b.height + 2 * PAD });
/** The drawn highlight kept on the screen, so its ring shows (the back link sits 4px from the corner). */
const onScreenBox = (b: Box): Box => {
  const top = Math.max(0, b.top);
  const left = Math.max(0, b.left);
  return { top, left, width: Math.min(innerWidth, b.left + b.width) - left, height: b.top + b.height - top };
};
const css = (b: Box) => ({ top: `${b.top}px`, left: `${b.left}px`, width: `${b.width}px`, height: `${b.height}px` });
const stepKey = (step: (typeof STEPS)[number], ctx: Ctx) => `${step.id}:${step.part?.(ctx) ?? ''}`;
