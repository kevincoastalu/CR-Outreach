#!/usr/bin/env node
/**
 * CR-Outreach page generator
 * ---------------------------------
 * Reads leads/leads.csv, renders one personalized landing page per lead from
 * site/templates/teaser-template.html into site/public/r/<slug>/index.html,
 * and writes leads/leads.generated.csv with a page_url column added so the
 * link can be pulled straight into Apollo (custom field / merge value).
 *
 * No external dependencies -- Node stdlib only, so Netlify's default build
 * image can run this with zero setup ("npm install" is not required).
 *
 * Usage:
 *   node scripts/generate-pages.js
 *
 * Config via environment variables (all optional):
 *   SITE_BASE_URL   Public site URL, no trailing slash. Default: https://cr-outreach.netlify.app
 *   SENDER_NAME     Default: Kevin Lackey
 *   SENDER_TITLE    Default: CyRisk
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LEADS_CSV = path.join(ROOT, 'leads', 'leads.csv');
const TEMPLATE_PATH = path.join(ROOT, 'site', 'templates', 'teaser-template.html');
const PUBLIC_DIR = path.join(ROOT, 'site', 'public');
const OUT_CSV = path.join(ROOT, 'leads', 'leads.generated.csv');

const SITE_BASE_URL = (process.env.SITE_BASE_URL || 'https://cr-outreach.netlify.app').replace(/\/+$/, '');
const SENDER_NAME = process.env.SENDER_NAME || 'Kevin Lackey';
const SENDER_TITLE = process.env.SENDER_TITLE || 'CyRisk';

// ---------- tiny CSV parser (handles quoted fields with commas/newlines) ----------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else if (c === '\r') {
      // skip, \n handles the row break
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((v) => v.trim() !== '')).map((r) => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = (r[idx] || '').trim(); });
    return obj;
  });
}

function toCsvValue(v) {
  const s = String(v == null ? '' : v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function writeCsv(rows, headers) {
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => toCsvValue(r[h])).join(','));
  }
  return lines.join('\n') + '\n';
}

// ---------- slug ----------
function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'lead';
}

function uniqueSlug(base, used) {
  let slug = base;
  let n = 2;
  while (used.has(slug)) {
    slug = `${base}-${n}`;
    n++;
  }
  used.add(slug);
  return slug;
}

// ---------- render ----------
function render(template, values) {
  return template.replace(/{{\s*([A-Z_]+)\s*}}/g, (m, key) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : m;
  });
}

function main() {
  if (!fs.existsSync(LEADS_CSV)) {
    console.error(`No leads file found at ${LEADS_CSV}.`);
    console.error('Copy leads/leads.example.csv to leads/leads.csv and fill it in, then re-run.');
    // Still make sure the public dir has a placeholder root page so Netlify has something to publish.
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    const placeholder = path.join(PUBLIC_DIR, 'index.html');
    if (!fs.existsSync(placeholder)) {
      fs.writeFileSync(placeholder, '<!doctype html><title>CR-Outreach</title><p>No leads.csv yet.</p>\n');
    }
    process.exit(0);
  }

  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const leads = parseCsv(fs.readFileSync(LEADS_CSV, 'utf8'));

  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  // Simple root index so the base domain isn't a 404.
  fs.writeFileSync(path.join(PUBLIC_DIR, 'index.html'), '<!doctype html><title>CyRisk</title><p>.</p>\n');

  const used = new Set();
  const outRows = [];

  for (const lead of leads) {
    const firstName = lead.first_name || 'there';
    const firmName = lead.firm_name || lead.company || 'your firm';
    const baseSlug = lead.slug ? slugify(lead.slug) : slugify(firmName);
    const slug = uniqueSlug(baseSlug, used);

    const html = render(template, {
      FIRST_NAME: firstName,
      FIRM_NAME: firmName,
      SLUG: slug,
      SENDER_NAME,
      SENDER_TITLE,
    });

    const outDir = path.join(PUBLIC_DIR, 'r', slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html);

    outRows.push({
      ...lead,
      slug,
      page_url: `${SITE_BASE_URL}/r/${slug}/`,
    });
  }

  const headers = Array.from(
    outRows.reduce((set, r) => { Object.keys(r).forEach((k) => set.add(k)); return set; }, new Set())
  );
  fs.writeFileSync(OUT_CSV, writeCsv(outRows, headers));

  console.log(`Generated ${outRows.length} page(s) into ${path.relative(ROOT, PUBLIC_DIR)}/r/<slug>/`);
  console.log(`Wrote ${path.relative(ROOT, OUT_CSV)} with page_url for each lead.`);
}

main();
