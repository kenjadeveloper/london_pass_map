#!/usr/bin/env node
/**
 * Postcode fallback geocoder for the London Pass attraction map.
 *
 * For any attraction still missing lat/lon after tools/geocode.mjs, this
 * pulls the UK postcode (full, e.g. "SE1 9EF", or just the outward code,
 * e.g. "W1D") out of its address and resolves it via postcodes.io — a free,
 * key-less UK postcode API that is far more reliable than name matching for
 * specific venues/restaurants. Coordinates are written back into
 * data/attractions.json. Re-running only touches rows that are still empty.
 *
 * Run: node tools/geocode-postcodes.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.resolve(__dirname, '..', 'data', 'attractions.json');
const delay = ms => new Promise(r => setTimeout(r, ms));

const FULL_PC = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;   // e.g. SE1 9EF
const OUTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\b(?!\s*\d[A-Z]{2})/i; // e.g. W1D (no inward part)

async function lookupFull(pc) {
  const res = await fetch('https://api.postcodes.io/postcodes/' + encodeURIComponent(pc));
  if (!res.ok) return null;
  const j = await res.json();
  if (j.status !== 200 || !j.result) return null;
  return { lat: j.result.latitude, lon: j.result.longitude, via: 'postcode ' + pc };
}

async function lookupOutcode(oc) {
  const res = await fetch('https://api.postcodes.io/outcodes/' + encodeURIComponent(oc));
  if (!res.ok) return null;
  const j = await res.json();
  if (j.status !== 200 || !j.result) return null;
  return { lat: j.result.latitude, lon: j.result.longitude, via: 'outcode ' + oc };
}

async function resolve(address) {
  const full = address.match(FULL_PC);
  if (full) {
    const loc = await lookupFull(full[1] + ' ' + full[2]);
    if (loc) return loc;
  }
  const out = address.match(OUTCODE);
  if (out) {
    const loc = await lookupOutcode(out[1]);
    if (loc) return loc;
  }
  return null;
}

async function main() {
  const list = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  const pending = list.filter(a => a.location_query && !(Number.isFinite(a.lat) && Number.isFinite(a.lon)));
  console.log(`${pending.length} attractions still need coordinates (postcode fallback).`);

  let hit = 0, miss = 0;
  for (const a of pending) {
    process.stdout.write(`${a.name} … `);
    try {
      const loc = await resolve(a.location_query);
      if (loc) {
        a.lat = loc.lat; a.lon = loc.lon; a.geo_display_name = a.location_query;
        hit++; console.log(`ok via ${loc.via} (${loc.lat.toFixed(5)}, ${loc.lon.toFixed(5)})`);
        await fs.writeFile(dataPath, JSON.stringify(list, null, 2) + '\n');
      } else { miss++; console.log('no postcode match'); }
    } catch (err) { miss++; console.log('error: ' + err.message); }
    await delay(200); // postcodes.io is generous, but stay polite
  }

  await fs.writeFile(dataPath, JSON.stringify(list, null, 2) + '\n');
  const resolved = list.filter(a => Number.isFinite(a.lat) && Number.isFinite(a.lon)).length;
  console.log(`\n${hit} newly geocoded, ${miss} unresolved. ${resolved}/${list.length} attractions now have coordinates.`);
}

main().catch(e => { console.error(e); process.exit(1); });
