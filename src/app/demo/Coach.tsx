// Coach marks for the demo (spec 2026-10-03, decisions 1, 5, 8, 9): the screen dims except the
// highlighted field, which is scrolled into view; the tip sits above or below it with an arrow, never
// over it; taps outside the highlight are blocked; the step completes on the user's own action.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { RecordStore } from '../../storage/db';
import { useAnimate } from '../settings';
import { setPace } from './dom';
import { placeTip, scrollToFit, unionRect, type Box, type Side } from './placement';
import { demoState, markDemoDone, removeDemoRecords, setDemoState, useDemo } from './state';
import { SCREEN_NAMES, STEPS, hashFor, screenOf, walls, type Ctx } from './steps';

const PAD = 6;
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
/** The on-screen keyboard is up: the visual viewport is well short of the window. */
const keyboardUp = () => !!visualViewport && visualViewport.height < innerHeight * 0.8;
const same = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5);
const focusInTarget = () => !!document.activeElement?.closest(`[${ATTR}]`);

function CoachView(props: { ctx: Ctx; index: number; replay: boolean; store: RecordStore }) {
  const { ctx, index } = props;
  const step = STEPS[index];
  const animate = useAnimate();
  const onScreen = ctx.screen === step.screen;
  const key = stepKey(step, ctx);
  const [box, setBox] = useState<(Box & { step: string }) | null>(null);
  const [view, setView] = useState<Box>(() => viewBox());
  const [tipH, setTipH] = useState(200);
  const [prefer, setPrefer] = useState<Side>('below');
  const [phase, setPhase] = useState<'ready' | 'busy' | 'done'>('ready');
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
    setPhase('ready');
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
      const typing = keyboardUp() && active instanceof HTMLElement && els.some((e) => e.contains(active)) ? [active, ...((active as HTMLInputElement).labels ?? [])] : null;
      const next = els.length ? pad(unionRect((typing ?? els).map((e) => e.getBoundingClientRect()))) : null;
      const key = stepKey(step, ctx);
      setBox((b) => (same(b, next) && b?.step === key ? b : next && { ...next, step: key }));
      const v = viewBox(els);
      setView((o) => (same(o, v) ? o : v));
      setPrefer(keyboardUp() ? 'above' : 'below');
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
  const scrollKey = `${key}|${Math.round(view.height)}`;
  useEffect(() => {
    // The box lags a step change by a frame: wait for this step's.
    if (!box || !onScreen || box.step !== key) return;
    const short = placeTip(box, { width: 420, height: tipH }, view, prefer).height < tipH;
    if (scrolledFor.current === scrollKey && !(short && tipH !== scrolledTipH.current)) return;
    const t = setTimeout(() => {
      scrolledFor.current = scrollKey;
      scrolledTipH.current = tipH;
      const d = scrollToFit(box, tipH, view, prefer);
      if (d) scrollBy({ top: d, behavior: animate && prefer === 'below' ? 'smooth' : 'auto' });
    }, 120);
    return () => clearTimeout(t);
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
    if (phase === 'ready' && valid && (!step.typed || !focusInTarget())) void complete();
  });

  const showMe = async () => {
    setPhase('busy');
    setPace(animate ? 1 : 0);
    try {
      await step.showMe!(live.current.ctx);
    } finally {
      setPhase('ready');
      (document.activeElement as HTMLElement | null)?.blur?.();
      bump();
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
  const takeBack = () => {
    scrolledFor.current = '';
    const h = hashFor(step.screen, ctx);
    if (!onScreen && h) location.hash = h;
    setBacks((n) => n + 1);
  };

  if (ctx.screen === 'loading') return null;
  const offscreen = !!box && (box.top + box.height < view.top || box.top > view.top + view.height);
  const hole = onScreen && box && !offscreen ? box : null;
  const typedNext = step.typed && valid && phase === 'ready';
  const problem = onScreen ? step.problem?.(ctx) : undefined;
  const showProblem = problem && (!focusInTarget() || Date.now() - lastInput.current > 1200);
  const place = hole
    ? placeTip(hole, { width: 420, height: tipH }, view, prefer)
    : { side: 'none' as const, top: view.top + Math.max(8, (view.height - tipH) / 2), left: view.left + 16, width: Math.min(420, view.width - 32), height: Math.min(tipH, view.height - 16), arrowLeft: 0, maxHeight: view.height - 16 };
  if (!hole) place.left = view.left + (view.width - place.width) / 2;

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
      {hole && (
        <span
          class="coach-arrow"
          aria-hidden="true"
          style={{ left: `${place.left + place.arrowLeft}px`, top: `${place.side === 'below' ? place.top - 7 : place.top + place.height - 9}px` }}
        />
      )}
      <div
        ref={tipEl}
        class={`coach-tip ${place.side}${prefer === 'above' ? ' compact' : ''}`}
        data-coach-tip
        role="dialog"
        aria-label="Demo guide"
        style={{ top: `${place.top}px`, left: `${place.left}px`, width: `${place.width}px`, maxHeight: `${place.maxHeight}px` }}
      >
        <p class="coach-count">
          Demo · {index + 1} of {STEPS.length}
        </p>
        {onScreen ? (
          <>
            <h2>
              {step.title} {phase === 'done' && <span class="coach-check">✓</span>}
            </h2>
            <p>{step.text(ctx)}</p>
            {step.sample && (
              <p class="coach-sample">
                Example: <strong>{step.sample}</strong>
              </p>
            )}
            {showProblem && (
              <p class="coach-problem" role="alert">
                {problem}
              </p>
            )}
            {offscreen && <p class="coach-sample">The highlighted field is off the screen.</p>}
          </>
        ) : (
          <>
            <h2>You left the demo step</h2>
            <p>
              This step is on {SCREEN_NAMES[step.screen]}: {step.title.toLowerCase()}.
            </p>
          </>
        )}
        <div class="coach-actions">
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
            <button type="button" class="btn small" onClick={showMe} disabled={phase !== 'ready'}>
              Show me
            </button>
          )}
          {!step.button && (
            <button type="button" class="link-btn" onClick={skip} disabled={phase !== 'ready'}>
              Skip step
            </button>
          )}
          {props.replay && (
            <button type="button" class="link-btn" onClick={exit}>
              Exit demo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const pad = (b: Box): Box => ({ top: b.top - PAD, left: b.left - PAD, width: b.width + 2 * PAD, height: b.height + 2 * PAD });
const css = (b: Box) => ({ top: `${b.top}px`, left: `${b.left}px`, width: `${b.width}px`, height: `${b.height}px` });
const stepKey = (step: (typeof STEPS)[number], ctx: Ctx) => `${step.id}:${step.part?.(ctx) ?? ''}`;
