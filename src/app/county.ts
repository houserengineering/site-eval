// The county a site address is in, from the US Census geocoder (free, no key). The geocoder sends no
// CORS headers, so it is called as JSONP through a script tag.

const URL_BASE = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';
const TIMEOUT_MS = 10_000;

const STATES: Record<string, string> = { '30': 'MT', '16': 'ID', '56': 'WY', '38': 'ND', '46': 'SD' };

export type CountyResult = { county: string; gallatin: boolean } | { notFound: true } | { offline: true };

let n = 0;
let last: { address: string; result: CountyResult } | undefined;

/** The address last looked up and what came back (the demo waits for it). */
export const lastCountyLookup = () => last;

/** Looks up the county for a one-line address, e.g. `6133 Bigelow Road, Bozeman MT 59718`. */
export async function findCounty(address: string): Promise<CountyResult> {
  const result = await lookup(address);
  last = { address, result };
  return result;
}

function lookup(address: string): Promise<CountyResult> {
  if (!navigator.onLine) return Promise.resolve({ offline: true });
  return new Promise((resolve) => {
    const cb = `__county${++n}`;
    const script = document.createElement('script');
    const done = (r: CountyResult) => {
      clearTimeout(timer);
      delete (window as any)[cb];
      script.remove();
      resolve(r);
    };
    const timer = setTimeout(() => done({ offline: true }), TIMEOUT_MS);
    (window as any)[cb] = (data: any) => {
      const c = data?.result?.addressMatches?.[0]?.geographies?.Counties?.[0];
      if (!c?.NAME) return done({ notFound: true });
      const state = STATES[c.STATE] ?? data.result.addressMatches[0].addressComponents?.state ?? '';
      done({ county: [c.NAME, state].filter(Boolean).join(', '), gallatin: c.STATE === '30' && c.COUNTY === '031' });
    };
    script.onerror = () => done({ offline: true });
    const q = new URLSearchParams({ address, benchmark: 'Public_AR_Current', vintage: 'Current_Current', layers: 'Counties', format: 'jsonp', callback: cb });
    script.src = `${URL_BASE}?${q}`;
    document.head.appendChild(script);
  });
}
