#!/usr/bin/env node
/**
 * One-time geocoder for the London Pass attraction map.
 *
 * Reads data/attractions.json, resolves each attraction's `location_query`
 * address to lat/lon via the public OpenStreetMap Nominatim service, and
 * writes the coordinates back into the same file so the map can plot every
 * pin instantly on load (no per-visit live geocoding).
 *
 * Polite by design: sequential requests, a descriptive User-Agent, and a
 * 1.1s pause between calls (Nominatim's public usage policy = max 1 req/sec).
 * Already-resolved rows are skipped, so re-running only fills in the gaps.
 *
 * Run: node tools/geocode.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataPath = path.join(root, 'data', 'attractions.json');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const UA = 'london-pass-map/1.0 (one-time geocode; https://londonpass.com)';

async function queryOnce(query) {
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en&countrycodes=gb&q='
    + encodeURIComponent(query);
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data || !data[0]) return null;
  return { lat: Number(data[0].lat), lon: Number(data[0].lon), display_name: data[0].display_name };
}

// Strip trailing tour/experience/food noise so a landmark name matches cleanly.
function nameQuery(name) {
  let n = String(name)
    .replace(/\s*[–—-]\s*.*$/, '')          // drop everything after an en/em dash
    .replace(/\s*\(.*?\)\s*/g, ' ')          // drop parentheticals like (Windsor)
    .replace(/\b(tour|tours|walking tour|experience|ticket|tickets|day trip|day pass|hop-on hop-off|audio tour|admission|with.*)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/london|windsor|greenwich|brighton|oxford|stonehenge/i.test(n)) n += ', London';
  return n;
}

// Try the full address first, then progressively looser queries.
async function geocode(a) {
  const candidates = [a.location_query, nameQuery(a.name)].filter(Boolean);
  for (let i = 0; i < candidates.length; i++) {
    const loc = await queryOnce(candidates[i]);
    if (loc) return loc;
    if (i < candidates.length - 1) await delay(1100);
  }
  return null;
}

async function main() {
  const raw = await fs.readFile(dataPath, 'utf8');
  const list = JSON.parse(raw);

  const pending = list.filter(a => a.location_query && !(Number.isFinite(a.lat) && Number.isFinite(a.lon)));
  console.log(`${list.length} attractions total · ${pending.length} still need coordinates.`);

  let hit = 0, miss = 0;
  for (let i = 0; i < pending.length; i++) {
    const a = pending[i];
    process.stdout.write(`[${i + 1}/${pending.length}] ${a.name} … `);
    try {
      const loc = await geocode(a);
      if (loc) {
        a.lat = loc.lat;
        a.lon = loc.lon;
        a.geo_display_name = loc.display_name;
        hit++;
        console.log(`ok (${loc.lat.toFixed(5)}, ${loc.lon.toFixed(5)})`);
        // Persist after every hit so an interrupted run keeps its progress.
        await fs.writeFile(dataPath, JSON.stringify(list, null, 2) + '\n');
      } else {
        miss++;
        console.log('no match');
      }
    } catch (err) {
      miss++;
      console.log(`error: ${err.message}`);
    }
    if (i < pending.length - 1) await delay(1100);
  }

  await fs.writeFile(dataPath, JSON.stringify(list, null, 2) + '\n');
  const resolved = list.filter(a => Number.isFinite(a.lat) && Number.isFinite(a.lon)).length;
  console.log(`\nDone. ${hit} newly geocoded, ${miss} unresolved. ${resolved}/${list.length} attractions now have coordinates.`);
  if (miss) console.log('Unresolved rows can be re-run later — this script skips anything already geocoded.');
}

main().catch(err => { console.error(err); process.exit(1); });
