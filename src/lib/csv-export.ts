/**
 * CSV export utility — zero-dependency client-side download.
 *
 * Handles escaping for commas, quotes, newlines, and non-ASCII chars.
 * Adds a UTF-8 BOM so Excel opens the file with correct encoding.
 */

export interface CsvColumn<T> {
  key: keyof T | string;
  header: string;
  /** Optional cell formatter — default: String(value) */
  format?: (row: T) => string | number | null | undefined;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const escape = (v: unknown): string => {
    if (v == null) return "";
    const s = String(v);
    // If the value contains comma, double-quote, or newline, wrap in quotes and escape quotes
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = columns.map((c) => escape(c.header)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => {
      const val = c.format ? c.format(row) : (row as Record<string, unknown>)[c.key as string];
      return escape(val);
    }).join(",")
  );

  return [header, ...body].join("\n");
}

export function downloadCsv<T>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
): void {
  const csv = toCsv(rows, columns);
  // UTF-8 BOM so Excel opens it correctly
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
