/**
 * Spreadsheet rows from an .xlsx workbook or a CSV file, with the standard library only (ported from Autonomous-QE's
 * tools/shared/xlsx.mts, the read half). Every worksheet as rows of cell text: shared and inline strings, numbers and
 * booleans; dates stay serial numbers. Legacy binary .xls isn't read: save it as .xlsx or .csv.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { BlockedError } from '../shared/errors.mts';

export type Sheet = { name: string; rows: string[][] };

type ZipEntry = { name: string; method: number; compressed: number; offset: number };

function zipEntries(buf: Buffer, file: string): ZipEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new BlockedError(`${file} isn't an .xlsx workbook (a legacy .xls?): save it as .xlsx or .csv.`);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new BlockedError(`${file} is damaged: save it again from Excel.`);
    const nameLen = buf.readUInt16LE(p + 28);
    out.push({
      name: buf.toString('utf8', p + 46, p + 46 + nameLen),
      method: buf.readUInt16LE(p + 10),
      compressed: buf.readUInt32LE(p + 20),
      offset: buf.readUInt32LE(p + 42),
    });
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return out;
}

function zipRead(buf: Buffer, e: ZipEntry): Buffer {
  const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
  const data = buf.subarray(start, start + e.compressed);
  if (e.method === 0) return Buffer.from(data);
  if (e.method === 8) return zlib.inflateRawSync(data);
  throw new BlockedError(`${e.name} uses zip compression ${e.method}, which isn't read: save the file again as .xlsx.`);
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#')
      return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e.toLowerCase()] ?? m;
  });
}
const textOf = (xml: string) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g)].map((m) => decodeXml(m[1] ?? '')).join('');

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of /^[A-Z]+/.exec(ref)?.[0] ?? 'A') n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function readXlsx(file: string): Sheet[] {
  const buf = fs.readFileSync(file);
  const entries = zipEntries(buf, file);
  const get = (name: string) => {
    const e = entries.find((x) => x.name === name);
    return e ? zipRead(buf, e).toString('utf8') : '';
  };
  const shared = [...get('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const rels = new Map(
    [...get('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map((m) => {
      const id = /Id="([^"]+)"/.exec(m[0])?.[1] ?? '';
      const target = /Target="([^"]+)"/.exec(m[0])?.[1] ?? '';
      return [id, target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`];
    }),
  );
  const sheets: Sheet[] = [];
  for (const m of get('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const name = decodeXml(/name="([^"]*)"/.exec(m[0])?.[1] ?? 'Sheet');
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1] ?? '';
    const rows: string[][] = [];
    for (const r of get(rels.get(rid) ?? '').matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rn = Number(/\br="(\d+)"/.exec(r[1])?.[1] ?? rows.length + 1) - 1;
      const row: string[] = [];
      let next = 0;
      for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /\br="([A-Z]+\d+)"/.exec(c[1])?.[1];
        const ci = ref ? colIndex(ref) : next;
        next = ci + 1;
        const t = /\bt="(\w+)"/.exec(c[1])?.[1] ?? 'n';
        const body = c[2] ?? '';
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let val = '';
        if (t === 's') val = shared[Number(v)] ?? '';
        else if (t === 'inlineStr') val = textOf(body);
        else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
        else val = v !== undefined ? decodeXml(v) : '';
        while (row.length < ci) row.push('');
        row[ci] = val;
      }
      while (rows.length < rn) rows.push([]);
      rows[rn] = row;
    }
    sheets.push({ name, rows });
  }
  return sheets;
}

/** RFC 4180 CSV (quoted fields, embedded newlines); the separator (comma, semicolon, tab) is read from the first line. */
export function readCsv(file: string): Sheet[] {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const sep = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return [{ name: 'csv', rows }];
}
