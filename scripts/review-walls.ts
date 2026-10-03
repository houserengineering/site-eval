// Sends walls from an app backup to the AI review service exactly as the app does (ticket 12), and
// prints what comes back. For checking the review on real jobs from the office; nothing is saved.
//
//   npx tsx scripts/review-walls.ts "<backup>.json" --token <device token> [--url https://…] [--walls 10A,10B]
//
// Without --url it reads the service URL from Dropbox\Server\Office\Site Eval App\Review Service.json.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../src/domain/fieldRecord';
import { parseReview, reviewPhotos, reviewRequest } from '../src/domain/aiReview';

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const file = args[0];
const token = opt('token') ?? process.env.REVIEW_TOKEN;
if (!file || !token) {
  console.error('usage: npx tsx scripts/review-walls.ts <backup.json> --token <device token> [--url <service>] [--walls 10A,10B]');
  process.exit(2);
}
const url =
  opt('url') ?? JSON.parse(readFileSync(join(homedir(), 'Dropbox', 'Server', 'Office', 'Site Eval App', 'Review Service.json'), 'utf8')).url;
const only = opt('walls')?.split(',').map((s) => s.trim().toUpperCase());

const backup = JSON.parse(readFileSync(file, 'utf8'));
const record = migrate(backup.record);
const photos: Record<string, { type: string; base64: string }> = backup.photos ?? {};

for (const wall of record.testPits) {
  if (only && !only.includes(wall.label.toUpperCase())) continue;
  const images = reviewPhotos(wall)
    .map((p) => photos[p.id])
    .filter(Boolean)
    .map((p) => ({ mediaType: p.type || 'image/jpeg', data: p.base64 }));
  if (!wall.horizons.length || !images.length) {
    console.log(`${wall.label}: skipped (${wall.horizons.length} horizons, ${images.length} photos)`);
    continue;
  }
  const started = Date.now();
  const res = await fetch(`${url.replace(/\/+$/, '')}/v1/review`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(reviewRequest(wall, images)),
  });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (!res.ok) {
    console.log(`${wall.label}: ${res.status} ${await res.text()}`);
    if (res.status === 401 || res.status === 503) break;
    continue;
  }
  const { text } = await res.json();
  const findings = parseReview(text, wall);
  const label = (id?: string) => wall.horizons.find((h) => h.id === id)?.designation;
  console.log(`${wall.label} (${images.length} photos, ${secs} s): ${findings == null ? `UNREADABLE: ${text}` : findings.length ? '' : 'no flags'}`);
  for (const f of findings ?? []) console.log(`  [${f.check}${label(f.horizonId) ? ` ${label(f.horizonId)}` : ''}] ${f.message}`);
}
