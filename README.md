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
- `src/storage/` — on-device IndexedDB persistence.
- `src/app/` — the Preact UI.

No client or job data is committed to this public repository. Job files are loaded on the device.
