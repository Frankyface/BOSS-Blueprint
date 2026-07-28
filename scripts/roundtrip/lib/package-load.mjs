/**
 * Load an export package off disk into the immutable bundle every rule reads.
 * Nothing here judges the package — the loader only reports what it found and
 * what it could not parse; the rules in lib/rules/** decide PASS/WARN/FAIL.
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';

export const ZIP_NAME_RE = /^blueprint_([a-z0-9]+(?:-[a-z0-9]+)*)_([0-9a-f]{8})\.zip$/;

/**
 * @param {string} zipPath
 * @returns {Promise<Readonly<object>>} the package bundle
 */
export async function loadPackage(zipPath) {
  const info = await stat(zipPath);
  const buffer = await readFile(zipPath);
  const basename = path.basename(zipPath);

  let zip;
  try {
    // noSort is REQUIRED: adm-zip alphabetises entries on read by default, which
    // would hide the true central-directory order that §1's write-order rule is about.
    zip = new AdmZip(buffer, { noSort: true });
  } catch (err) {
    throw new Error(`cannot open zip: ${err.message}`);
  }

  const rawEntries = zip.getEntries();
  const entries = rawEntries.map((e) => ({
    name: e.entryName,
    isDirectory: e.isDirectory,
    size: e.header.size,
    compressedSize: e.header.compressedSize,
  }));

  const files = new Map();
  for (const entry of rawEntries) {
    if (entry.isDirectory) continue;
    files.set(entry.entryName, entry.getData());
  }

  const nameMatch = ZIP_NAME_RE.exec(basename);

  const siteRaw = files.get('site.json') ?? null;
  const briefRaw = files.get('brief.md') ?? null;

  const siteText = siteRaw ? decodeUtf8(siteRaw) : null;
  const briefText = briefRaw ? decodeUtf8(briefRaw) : null;

  let site = null;
  let siteParseError = null;
  if (siteText) {
    try {
      site = JSON.parse(siteText.text);
    } catch (err) {
      siteParseError = err.message;
    }
  }

  return Object.freeze({
    zipPath,
    basename,
    zipBytes: info.size,
    filenameSlug: nameMatch ? nameMatch[1] : null,
    filenameUuid8: nameMatch ? nameMatch[2] : null,
    filenameMatchesPattern: Boolean(nameMatch),
    entries: Object.freeze(entries),
    entryNames: Object.freeze(entries.filter((e) => !e.isDirectory).map((e) => e.name)),
    directoryEntryNames: Object.freeze(entries.filter((e) => e.isDirectory).map((e) => e.name)),
    files,
    site,
    siteText,
    siteParseError,
    briefText,
    briefRaw,
    siteRaw,
  });
}

/**
 * Decode a buffer as UTF-8 and report the §1 "File conventions" facts the
 * convention check needs (BOM, CRLF, trailing newline).
 */
export function decodeUtf8(buffer) {
  const hasBom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  const body = hasBom ? buffer.subarray(3) : buffer;
  const text = new TextDecoder('utf-8', { fatal: false }).decode(body);
  return {
    text,
    hasBom,
    hasCrlf: /\r\n/.test(text),
    hasLoneCr: /\r(?!\n)/.test(text),
    bytes: buffer.length,
  };
}

/**
 * Every entry §1 says should be in the zip, in §1 write order.
 * site.json and brief.md are always expected; the pages/ and assets/ entries can
 * only be derived from a parseable manifest.
 */
export function expectedEntryNames(site) {
  if (!site || typeof site !== 'object') return ['site.json', 'brief.md'];
  const pages = Array.isArray(site.pages) ? site.pages : [];
  const assets = Array.isArray(site.assets) ? site.assets : [];
  return [
    'site.json',
    'brief.md',
    ...pages.map((p) => (typeof p?.screenshot === 'string' ? p.screenshot : '<missing page.screenshot>')),
    ...assets.map((a) => (typeof a?.path === 'string' ? a.path : '<missing asset.path>')),
  ];
}
