// Device settings: optional modules shown on this device, and the AI photo review token.
import type { RecordStore } from '../storage/db';
import { changeSettings, useSettings } from './settings';

export function SettingsView(props: { store: RecordStore }) {
  const s = useSettings();
  return (
    <main class="page">
      <header class="bar">
        <a class="back" href="#/" aria-label="All site evaluations">
          ‹
        </a>
        <h1>Settings</h1>
      </header>
      <p class="hint">These settings stay on this device.</p>
      <div class="field">
        <label class="toggle">
          <input type="checkbox" checked={s.percTests} aria-describedby="perc-hint" onChange={(e) => changeSettings(props.store, { percTests: e.currentTarget.checked })} />
          Perc tests
        </label>
        <p class="hint" id="perc-hint">
          Shows perc tests in site evaluations and their forms in the deliverables. Turning this off only hides them; perc tests already recorded stay saved.
        </p>
      </div>
      <div class="field">
        <label for="review-token">AI photo review device token</label>
        <input
          id="review-token"
          type="password"
          autoComplete="off"
          value={s.reviewToken}
          aria-describedby="review-hint"
          onChange={(e) => changeSettings(props.store, { reviewToken: e.currentTarget.value.trim() })}
        />
        <p class="hint" id="review-hint">
          From the office PC (<code>node service.mjs enroll "phone name"</code>). With a token, each wall's photos and log go to the office review service and what it
          finds joins the pit checks. Leave it empty to turn the review off.
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
