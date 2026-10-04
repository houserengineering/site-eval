// Device settings: optional modules shown on this device, and the AI photo review token.
import type { RecordStore } from '../storage/db';
import { startDemo } from './demo/state';
import { useState } from 'preact/hooks';
import { takeEnrolledNotice } from './enroll';
import { DropboxSettings } from './SyncPanel';
import { Chips } from './fields';
import { changeSettings, useSettings } from './settings';
import { FEATURES } from './features';

export function SettingsView(props: { store: RecordStore }) {
  const s = useSettings();
  const [enrolled] = useState(takeEnrolledNotice);
  return (
    <main class="page">
      <header class="bar">
        <a class="back" href="#/" aria-label="All site evaluations">
          ‹
        </a>
        <h1>Settings</h1>
      </header>
      <p class="hint">These settings stay on this device.</p>
      <DropboxSettings />
      <div class="field">
        <button
          type="button"
          class="btn block"
          aria-describedby="demo-hint"
          onClick={() => startDemo(props.store, true)}
        >
          Replay the demo
        </button>
        <p class="hint" id="demo-hint">
          A guided practice run on a made-up job. It never goes to Dropbox and deletes itself when you finish.
        </p>
      </div>
      <Chips
        label="Motion"
        options={[
          { value: 'device', label: 'Auto' },
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ]}
        value={s.motion}
        onChange={(v) => changeSettings(props.store, { motion: (v || 'device') as typeof s.motion })}
        hint={`Gliding highlights and "Show me" in the demo. Auto follows this device, which ${matchMedia('(prefers-reduced-motion: reduce)').matches ? 'asks for reduced motion' : 'allows motion'}.`}
      />
      {FEATURES.PERC && (
      <div class="field">
        <label class="toggle">
          <input type="checkbox" checked={s.percTests} aria-describedby="perc-hint" onChange={(e) => changeSettings(props.store, { percTests: e.currentTarget.checked })} />
          Perc tests
        </label>
        <p class="hint" id="perc-hint">
          Shows perc tests in site evaluations and their forms in the deliverables. Turning this off only hides them; perc tests already recorded stay saved.
        </p>
      </div>
      )}
      <div class="field">
        {s.reviewToken ? (
          <>
            <p class="label-row label" id="review-label">
              AI photo review <span class="badge warn">Beta</span>
            </p>
            {enrolled && (
              <p class="ok-box" role="status">
                AI photo review is on for this device.
              </p>
            )}
            <div class="token-row">
              <span aria-describedby="review-label">Token saved on this device ••••{s.reviewToken.slice(-4)}</span>
              <button type="button" class="btn" onClick={() => changeSettings(props.store, { reviewToken: '' })}>
                Remove
              </button>
            </div>
          </>
        ) : (
          <>
            <label for="review-token" class="label-row">
              AI photo review token <span class="badge warn">Beta</span>
            </label>
            <input
              id="review-token"
              type="password"
              autoComplete="off"
              value=""
              aria-describedby="review-hint"
              onChange={(e) => changeSettings(props.store, { reviewToken: e.currentTarget.value.trim() })}
            />
          </>
        )}
        <p class="hint" id="review-hint">
          {s.reviewToken
            ? "Each wall's photos and log go to the office review service, and what it finds joins the pit checks. It is still being tuned: treat its flags as suggestions and accept any that do not apply. Remove turns the review off on this device."
            : "Paste the token from the office PC, or open the enrollment link it gives you on this phone. Leave it empty to keep the review off."}
        </p>
      </div>
      {s.percTests && (
        <a class="row-link" href="#/certifier">
          <span class="row-title">Certifier signature</span>
          <span class="row-sub">Set up the certifying engineer's device to sign perc tests</span>
        </a>
      )}
    </main>
  );
}
