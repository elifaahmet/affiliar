// Small CSV helpers used by bulk-import / export flows app-wide. RFC 4180-ish:
// commas separate fields, double-quote wraps a field that contains commas /
// newlines / quotes, and an escaped quote inside a quoted field is `""`.

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

/** Parse a CSV string into header + row-objects. Skips blank lines and #-comments. */
export function parseCsv(text: string): ParsedCsv {
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && isSkippable(lines[i])) i++;
  if (i >= lines.length) return { headers: [], rows: [] };

  const headers = parseRow(lines[i]).map((h) => h.trim());
  i++;

  const rows: Record<string, string>[] = [];
  for (; i < lines.length; i++) {
    if (isSkippable(lines[i])) continue;
    const cells = parseRow(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? '').trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

function isSkippable(line: string): boolean {
  const t = line.trim();
  return !t || t.startsWith('#');
}

function parseRow(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"')                   { inQuotes = false; }
      else                                  { cur += c; }
    } else {
      if (c === ',')      { out.push(cur); cur = ''; }
      else if (c === '"') { inQuotes = true; }
      else                { cur += c; }
    }
  }
  out.push(cur);
  return out;
}

/** Build a CSV string from headers + arbitrary row objects (missing keys → empty). */
export function buildCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ].join('\n');
}

/** Trigger a CSV file download in the browser. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Read a File (from <input type="file">) as text. */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
