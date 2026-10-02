// Device settings: optional modules shown on this device.
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
      {s.percTests && (
        <a class="row-link" href="#/certifier">
          <span class="row-title">Certifier signature</span>
          <span class="row-sub">Set up the certifying engineer's device to sign perc tests</span>
        </a>
      )}
    </main>
  );
}
