/**
 * Strips the test account's password from an evidence folder after a run (0.8.0, Q58). Playwright's trace keeps every
 * value a script fills: as an action parameter, in a DOM snapshot, and in the sign-in request's body. The gate keeps the
 * trace of a failed scenario, so without this the password sits in plain text in trace.zip. Zip entries are inflated,
 * cleaned and written back; a zip that can't be read is removed rather than kept. Standard library only.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const MARK = '[removed]';
const BINARY = /\.(?:jpe?g|png|gif|webp|webm|mp4)$/i;
const TEXT = /\.(?:md|txt|json|ya?ml|html?|log|trace|network|stacks|har|dat)$/i;

/** The ways a value is written into a trace: as it is, URL-encoded (form bodies, with + for a space), JSON-escaped. */
function forms(secret: string): string[] {
  const url = encodeURIComponent(secret);
  const json = JSON.stringify(secret).slice(1, -1);
  return [...new Set([secret, url, url.replace(/%20/g, '+'), json])].map((f) => Buffer.from(f).toString('latin1'));
}

function redact(data: Buffer, needles: string[]): Buffer {
  let text = data.toString('latin1');
  for (const n of needles) text = text.split(n).join(MARK);
  return Buffer.from(text, 'latin1');
}

type Entry = { name: string; method: number; time: number; date: number; data: Buffer };

function readZip(zip: Buffer): Entry[] {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--)
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('not a zip');
  const count = zip.readUInt16LE(eocd + 10);
  let at = zip.readUInt32LE(eocd + 16);
  if (count === 0xffff || at === 0xffffffff) throw new Error('zip64 is not supported');
  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error('bad central directory');
    const method = zip.readUInt16LE(at + 10);
    const time = zip.readUInt16LE(at + 12);
    const date = zip.readUInt16LE(at + 14);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error('bad local header');
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + size);
    if (method !== 0 && method !== 8) throw new Error(`unsupported compression ${method}`);
    entries.push({ name, method, time, date, data: method === 0 ? raw : zlib.inflateRawSync(raw) });
  }
  return entries;
}

function writeZip(entries: Entry[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const body = e.method === 0 ? e.data : zlib.deflateRawSync(e.data);
    const crc = zlib.crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(e.method, 8);
    local.writeUInt16LE(e.time, 10);
    local.writeUInt16LE(e.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    local.copy(dir, 6, 4, 30); // version needed .. name length, the same fields in the same order
    dir.writeUInt32LE(offset, 42);
    parts.push(local, name, body);
    central.push(dir, name);
    offset += local.length + name.length + body.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

function scrubZip(file: string, needles: string[]) {
  const entries = readZip(fs.readFileSync(file));
  for (const e of entries) if (!BINARY.test(e.name)) e.data = redact(e.data, needles);
  fs.writeFileSync(file, writeZip(entries));
}

/** Every file under `dir`: a zip's entries and the text files are cleaned of each secret; nothing happens without one. */
export function scrubEvidence(dir: string, secrets: (string | undefined)[]): void {
  const needles = [...new Set(secrets.filter((s): s is string => !!s).flatMap(forms))];
  if (!needles.length || !fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir, { recursive: true })) {
    const file = path.join(dir, String(f));
    if (!fs.statSync(file).isFile()) continue;
    if (/\.zip$/i.test(file)) {
      try {
        scrubZip(file, needles);
      } catch {
        fs.rmSync(file, { force: true });
      }
    } else if (TEXT.test(file)) fs.writeFileSync(file, redact(fs.readFileSync(file), needles));
  }
}
