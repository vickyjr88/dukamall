// A small, dependency-free CSV reader/writer -- the only two things this
// platform ever needs CSV for are the product export/import pair, and both
// only carry plain values (SKUs, prices, integers, true/false), so a real
// RFC 4180 parser (multi-line quoted fields, embedded newlines) is more
// than this ever needs. Still handles quoted fields and escaped quotes
// (""), since a product or variant name can contain a comma.

export function parseCsv(text: string): Record<string, string>[] {
  const rows = splitCsvRows(text.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1)
    .filter((row) => row.some((cell) => cell.trim() !== ''))
    .map((row) => {
      const record: Record<string, string> = {};
      header.forEach((key, i) => { record[key.trim()] = (row[i] ?? '').trim(); });
      return record;
    });
}

function splitCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { inQuotes = false; }
      else { field += char; }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

export function toCsv(rows: Record<string, string | number | boolean>[], columns: string[]): string {
  const escape = (value: unknown) => {
    const str = String(value ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((col) => escape(row[col])).join(','));
  }
  return lines.join('\n');
}
