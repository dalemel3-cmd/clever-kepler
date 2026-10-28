// Minimal .xlsx reader (v5.11.0, docs/HANDOFF.md §137): enough to read a program sheet
// from Excel or Google Sheets (File > Download > .xlsx) without a library - unzip with
// the browser's DecompressionStream, read shared strings, cell values and the number
// formats that matter here (60% stays "60%", dates become M/D/YYYY). Values only - no
// formulas are evaluated (the saved result is used), merged cells keep their top-left
// value like a CSV export. Returns every sheet: [{ name, rows: string[][] }].
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const utf8 = new TextDecoder('utf-8');

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ZIP central directory -> { path: () => Promise<Uint8Array> }
function zipEntries(buf) {
  const b = new Uint8Array(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Not a valid .xlsx file.');
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const out = {};
  for (let i = 0; i < count && u32(b, p) === 0x02014b50; i++) {
    const method = u16(b, p + 10), size = u32(b, p + 20), nameLen = u16(b, p + 28), extraLen = u16(b, p + 30), commentLen = u16(b, p + 32), local = u32(b, p + 42);
    const name = utf8.decode(b.subarray(p + 46, p + 46 + nameLen));
    out[name] = async () => {
      const start = local + 30 + u16(b, local + 26) + u16(b, local + 28);
      const data = b.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      throw new Error(`Unsupported compression in ${name}.`);
    };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const xml = (bytes) => new DOMParser().parseFromString(utf8.decode(bytes), 'application/xml');
const kids = (el, tag) => Array.from(el.getElementsByTagName(tag));
const colIndex = (ref) => { const m = String(ref).match(/^([A-Z]+)/i); let n = 0; for (const ch of (m ? m[1].toUpperCase() : 'A')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
const fmtNumber = (v) => String(+Number(v).toFixed(10));
const serialToMdy = (v) => { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(Number(v) * 86400000)); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`; };

export async function readXlsx(arrayBuffer) {
  const z = zipEntries(arrayBuffer);
  const get = async (path) => (z[path] ? xml(await z[path]()) : null);
  const strings = [];
  const ss = await get('xl/sharedStrings.xml');
  if (ss) for (const si of kids(ss, 'si')) strings.push(kids(si, 't').map(t => t.textContent).join(''));
  // Number formats: which style indexes are percents or dates.
  const kind = [];
  const st = await get('xl/styles.xml');
  if (st) {
    const custom = {};
    for (const nf of kids(st, 'numFmt')) custom[nf.getAttribute('numFmtId')] = nf.getAttribute('formatCode') || '';
    const xfs = st.getElementsByTagName('cellXfs')[0];
    if (xfs) for (const xf of kids(xfs, 'xf')) {
      const id = Number(xf.getAttribute('numFmtId') || 0);
      const code = (custom[id] || '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
      kind.push(id === 9 || id === 10 || code.includes('%') ? 'pct' : DATE_IDS.has(id) || /[dmy]/i.test(code) ? 'date' : '');
    }
  }
  const wb = await get('xl/workbook.xml');
  const rels = await get('xl/_rels/workbook.xml.rels');
  const target = {};
  if (rels) for (const r of kids(rels, 'Relationship')) target[r.getAttribute('Id')] = r.getAttribute('Target');
  const sheets = [];
  for (const s of wb ? kids(wb, 'sheet') : []) {
    const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let path = target[rid] || '';
    path = path.startsWith('/') ? path.slice(1) : `xl/${path.replace(/^\.\//, '')}`;
    const doc = await get(path);
    if (!doc) continue;
    const rows = [];
    for (const row of kids(doc, 'row')) {
      const ri = Number(row.getAttribute('r') || rows.length + 1) - 1;
      const cells = rows[ri] || (rows[ri] = []);
      kids(row, 'c').forEach((c, k) => {
        const ci = c.getAttribute('r') ? colIndex(c.getAttribute('r')) : k;
        const t = c.getAttribute('t');
        const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
        let out = '';
        if (t === 's') out = strings[Number(v)] ?? '';
        else if (t === 'inlineStr') out = kids(c, 't').map(x => x.textContent).join('');
        else if (t === 'b') out = v === '1' ? 'TRUE' : 'FALSE';
        else if (t === 'str' || t === 'e') out = v;
        else if (v !== '') {
          const k2 = kind[Number(c.getAttribute('s') || 0)] || '';
          out = k2 === 'pct' ? `${fmtNumber(Number(v) * 100)}%` : k2 === 'date' ? serialToMdy(v) : fmtNumber(v);
        }
        cells[ci] = out;
      });
    }
    sheets.push({ name: s.getAttribute('name') || `Sheet ${sheets.length + 1}`, rows: Array.from(rows, r => Array.from(r || [], x => x ?? '')) });
  }
  return sheets;
}
