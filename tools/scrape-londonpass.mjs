#!/usr/bin/env node
/**
 * Refresh helper for the London Pass attraction map.
 *
 * Uses only Node 20+ built-in fetch and is intentionally polite: sequential detail-page
 * requests plus a 900ms pause. It extracts titles, mapped Google address text, main
 * description, inclusion bullets, and opening-hours text when available. The generated
 * snapshot is helpful for auditing before publishing.
 *
 * Run: node tools/scrape-londonpass.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataPath = path.join(root, 'data', 'attractions.json');
const outPath = path.join(root, 'data', 'attractions-refreshed.json');
const csvPath = path.join(root, 'data', 'attractions-refreshed.csv');
const listing = 'https://londonpass.com/en/london-attractions?sort=topPicks';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const clean = html => html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
const esc = value => '"' + String(value ?? '').replaceAll('"','""') + '"';

function section(text, heading, nextHeadings) {
  const start = text.indexOf(heading);
  if (start < 0) return '';
  const after = text.slice(start + heading.length);
  const ends = nextHeadings.map(h => after.indexOf(h)).filter(i => i >= 0);
  return (ends.length ? after.slice(0, Math.min(...ends)) : after).trim().slice(0, 5000);
}
function absolute(url) { return new URL(url, listing).href; }
function getLinks(html) {
  const found = new Map();
  const re = /href=["']([^"']*\/en\/london-attractions\/[^"'?#]+)[^"']*["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = absolute(m[1]);
    const slug = href.split('/').pop();
    if (!['london-attractions',''].includes(slug)) found.set(slug, href);
  }
  return [...found.values()];
}
function addressFromHtml(html) {
  const headingAt = html.indexOf("Where you'll be");
  const sectionHtml = headingAt >= 0 ? html.slice(headingAt, headingAt + 30000) : html;
  const mapHref = /<a[^>]+href=["']https?:\/\/(?:www\.)?google\.[^"']+["'][^>]*>([\s\S]*?)<\/a>/i.exec(sectionHtml);
  if (mapHref) return clean(mapHref[1]);
  const mapsText = /Where you(?:'|’)ll be[\s\S]{0,6000}?([A-Z][^<]{12,180}?)(?:Standard opening hours|Find out more|<\/section|<h2)/i.exec(sectionHtml);
  return mapsText ? clean(mapsText[1]) : '';
}
function titleFromHtml(html) {
  const m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  return m ? clean(m[1]) : '';
}
function urlMatchesName(url, name) {
  const normalized = name.toLowerCase().replaceAll('’', '').replace(/[^a-z0-9]+/g,' ').trim().split(' ').filter(Boolean);
  const slug = url.toLowerCase().replace(/[^a-z0-9]+/g,' ');
  return normalized.filter(t=>t.length>3).slice(0,4).some(t=>slug.includes(t));
}

console.log('Fetching London Pass listing…');
const listingResponse = await fetch(listing, { headers: {'User-Agent':'LondonPassMapRefresh/1.0 (local data refresh)'} });
if (!listingResponse.ok) throw new Error(`Listing fetch failed: ${listingResponse.status}`);
const linkList = getLinks(await listingResponse.text());
console.log(`Found ${linkList.length} candidate attraction URLs.`);
const seeded = JSON.parse(await fs.readFile(dataPath,'utf8'));
const refreshed = [];

for (let i=0; i<seeded.length; i++) {
  const item = {...seeded[i]};
  const direct = linkList.find(url => urlMatchesName(url, item.name));
  if (!direct) {
    item.refresh_status = 'No direct source-page match found from listing HTML';
    refreshed.push(item);
    continue;
  }
  console.log(`[${i+1}/${seeded.length}] ${item.name}`);
  try {
    const response = await fetch(direct, { headers: {'User-Agent':'LondonPassMapRefresh/1.0 (local data refresh)'} });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const text = clean(html);
    item.source_page = direct;
    item.official_title = titleFromHtml(html) || item.name;
    item.official_address = addressFromHtml(html);
    item.what_youll_do = section(text, "What you'll do", ["What's included", 'Reservations', 'Know before you go', 'Where you\'ll be', 'FAQs']);
    item.whats_included = section(text, "What's included", ['Reservations', 'Know before you go', 'Where you\'ll be', 'FAQs']);
    item.opening_hours = section(text, 'Standard opening hours', ['Upcoming schedule changes', 'Find out more', 'Build your unique']);
    item.refresh_status = 'Fetched';
  } catch (err) {
    item.refresh_status = `Fetch failed: ${err.message}`;
  }
  refreshed.push(item);
  await delay(900);
}
await fs.writeFile(outPath, JSON.stringify(refreshed,null,2),'utf8');
const fields = ['id','name','category','location_type','location_query','official_address','source_page','what_youll_do','whats_included','opening_hours','refresh_status'];
await fs.writeFile(csvPath, [fields.join(','), ...refreshed.map(row=>fields.map(f=>esc(row[f])).join(','))].join('\n'),'utf8');
console.log(`Wrote ${outPath} and ${csvPath}.`);
