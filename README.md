# Site evaluation field app

Installable, offline web app for Houser Engineering septic site evaluations: log test pits and horizons on a phone and generate the soil log in the office template layout.

Live: https://houserengineering.github.io/site-eval/

## Develop

```
npm install
npm test          # generator golden tests + storage
npm run e2e       # Playwright on a Pixel 7 viewport against a local build
npm run dev
```

`E2E_URL=https://houserengineering.github.io/site-eval/ npm run e2e` runs the end-to-end test against the deployed app.

## Structure

- `src/domain/fieldRecord.ts` — field record model (versioned schema + migrations).
- `src/generator/` — `generate(fieldRecord, templates) → files`, the deliverable seam.
- `src/templates/soil-log/` — snapshot of the office `Soil Log Template.xls` (layout only, sample values cleared, source SHA-256 recorded). Refresh with `tools/snapshot-soil-log.ps1` on the office PC.
- `src/templates/perc-test/` — snapshot of the office `Perc Test.xlsx` (cells located by label; sample values cleared). Refresh with `python tools/snapshot_perc_test.py "%USERPROFILE%\Dropbox\Server\Office\Tools\Wastewater Tools\SEPTIC\SITE EVALUATION\Perc Test.xlsx" src/templates/perc-test`.
- `src/storage/` — on-device IndexedDB persistence and the sync outbox.
- `src/domain/merge.ts` — field-level last-writer-wins merge with "edited by" stamps.
- `src/sync/` — Dropbox seam: `SyncAdapter` (Dropbox HTTP API with PKCE sign-in, and `FakeSync` in memory), the engine (sync record, mirror photos, file deliverables, print queue) and naming. Deliverables are filed unnumbered (`Soil Logs.xlsx/.pdf`, `Percolation Tests.xlsx/.pdf`, `Site Evaluation.pdf`) in the chosen folder; app data goes in `Site Eval App/`. The app never replaces a file it did not write (or one edited since): it files `… (Site Eval App).ext` beside it.

`DROPBOX_TOKEN_FILE=<file holding an access token> npx vitest run test/dropbox.live.test.ts` runs the real Dropbox round trip (writes only under `/Server/Office/Site Eval App/Live Test/`). `?fake-dropbox` runs the app against the in-memory fake (end-to-end tests).
- `src/app/` — the Preact UI.

No client or job data is committed to this public repository. Job files are loaded on the device.

The confirmation field is preserved exactly as entered in backups and generated logs, including prefixes such as `SE CONFIRM`. For an existing project, the default filing folder uses the entire project number: `0999.001` resolves to `/Server/0999/001`. The app checks that exact folder in the connected Dropbox account and repairs missing or malformed saved paths when the project folder exists. An automatic default follows later project-number corrections; if the new project cannot be resolved, the old project's automatic destination is cleared. Pasted paths outside Dropbox's Server folder are rejected instead of being converted into invented server paths. Explicitly selected existing folders remain available and stay selected across project edits.
