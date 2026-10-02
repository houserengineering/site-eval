// Running perc timers for every perc test, pinned to the bottom of each screen, with due alerts.
// Timers are computed from recorded timestamps, so they survive backgrounding and reload.
import { useEffect, useState } from 'preact/hooks';
import { localNow, type FieldRecord, type LocalDateTime } from '../domain/fieldRecord';
import { countdown, percTimer } from '../domain/perc';

export function useNow(ms = 1000): LocalDateTime {
  const [now, setNow] = useState(localNow);
  useEffect(() => {
    const tick = () => setNow(localNow());
    const id = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [ms]);
  return now;
}

export const secondsUntil = (dueAt: LocalDateTime, now: LocalDateTime) => (Date.parse(dueAt) - Date.parse(now)) / 1000;

let audio: AudioContext | undefined;

/** Call from a tap that starts a timer: unlocks sound and asks for notification permission. */
export function primeAlerts() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    /* no Web Audio: vibration and notification still alert */
  }
  if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
}

function beep() {
  if (!audio) return;
  for (const start of [0, 0.45, 0.9]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.4;
    osc.connect(gain).connect(audio.destination);
    osc.start(audio.currentTime + start);
    osc.stop(audio.currentTime + start + 0.3);
  }
}

function alertDue(title: string, body: string, tag: string) {
  navigator.vibrate?.([400, 200, 400, 200, 400]);
  beep();
  if ('Notification' in window && Notification.permission === 'granted')
    void navigator.serviceWorker?.ready.then((reg) => reg.showNotification(title, { body, tag, requireInteraction: true }));
}

const alerted = new Set<string>();

export function PercTimers({ record }: { record: FieldRecord }) {
  const now = useNow();
  const timers = record.percTests
    .map((t) => ({ test: t, timer: percTimer(t, now) }))
    .filter((x): x is { test: (typeof x)['test']; timer: NonNullable<(typeof x)['timer']> } => x.timer != null)
    .sort((a, b) => a.timer.dueAt.localeCompare(b.timer.dueAt));

  useEffect(() => {
    for (const { test, timer } of timers) {
      const key = `${test.id}|${timer.kind}|${timer.dueAt}`;
      if (secondsUntil(timer.dueAt, now) > 0 || alerted.has(key)) continue;
      alerted.add(key);
      alertDue(`Perc test ${test.label}: ${timer.label} due`, `Due at ${timer.dueAt.slice(11, 16)}`, key);
    }
  }, [now]);

  // Keep the screen on while a timer runs, so alerts fire on time (a dimmed phone suspends the page).
  const running = timers.length > 0;
  useEffect(() => {
    if (!running || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    let stop = false;
    const take = () =>
      navigator.wakeLock.request('screen').then(
        (l) => (stop ? void l.release() : (lock = l)),
        () => {},
      );
    void take();
    const onVis = () => document.visibilityState === 'visible' && void take();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop = true;
      void lock?.release();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [running]);

  if (!running) return null;
  return (
    <nav class="timers" aria-label="Perc timers">
      {timers.map(({ test, timer }) => {
        const s = secondsUntil(timer.dueAt, now);
        return (
          <a key={test.id} class={s <= 0 ? 'due' : ''} href={`#/se/${record.id}/perc/${test.id}`}>
            <span>
              Perc {test.label} · {timer.label}
            </span>
            <span class="t">{s <= 0 ? `DUE +${countdown(s)}` : countdown(s)}</span>
          </a>
        );
      })}
    </nav>
  );
}
