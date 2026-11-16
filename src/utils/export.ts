export const COPYRIGHT_NOTICE = `© ${new Date().getFullYear()} MINE OS. All rights reserved.`;
export const EXPORT_DISCLAIMER = 'Confidential / proprietary output. Read-only advisory data; verify measurements, mappings, units, calibration, and safety/operational constraints before decisions. No industrial control actions.';

function stampName(base: string, ext: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return `${base}-${ts}.${ext}`;
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(filename: string, text: string, type = 'text/plain;charset=utf-8') {
  downloadBlob(filename, new Blob([text], { type }));
}

export function downloadJson(baseName: string, data: unknown) {
  const payload = (data && typeof data === 'object' && !Array.isArray(data))
    ? { ...(data as any), copyright: (data as any).copyright ?? COPYRIGHT_NOTICE, exportDisclaimer: (data as any).exportDisclaimer ?? EXPORT_DISCLAIMER }
    : { data, copyright: COPYRIGHT_NOTICE, exportDisclaimer: EXPORT_DISCLAIMER };
  downloadText(stampName(baseName, 'json'), JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
}

function escCsv(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) || (typeof v === 'object') ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  const cols = columns ?? Array.from(rows.reduce((set, r) => { Object.keys(r || {}).forEach(k => set.add(k)); return set; }, new Set<string>()));
  const header = cols.map(escCsv).join(',');
  const body = rows.map(r => cols.map(c => escCsv((r as any)?.[c])).join(','));
  return [header, ...body].join('\r\n');
}

export function downloadCsv(baseName: string, rows: Array<Record<string, unknown>>, columns?: string[], meta?: Record<string, unknown>) {
  const lines: string[] = [];
  lines.push(`# ${COPYRIGHT_NOTICE}`);
  lines.push(`# ${EXPORT_DISCLAIMER}`);
  if (meta) for (const [k, v] of Object.entries(meta)) lines.push(`# ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  lines.push('');
  lines.push(toCsv(rows, columns));
  // UTF-8 BOM helps Excel recognize encoding
  downloadText(stampName(baseName, 'csv'), '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
}

export interface PrintReportSection {
  title: string;
  description?: string;
  kv?: Array<{ label: string; value: unknown }>;
  table?: { columns: string[]; rows: Array<Record<string, unknown>> };
  pre?: unknown;
}

export function openPrintReport(opts: {
  title: string;
  subtitle?: string;
  meta?: Array<{ label: string; value: unknown }>;
  sections: PrintReportSection[];
}) {
  const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fmt = (v: unknown) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : String(v);
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'object') return esc(JSON.stringify(v, null, 2));
    return esc(v);
  };
  const metaHtml = (opts.meta || []).map(m => `<div class="kv"><span class="k">${esc(m.label)}</span><span class="v">${fmt(m.value)}</span></div>`).join('');
  const sectionsHtml = opts.sections.map(sec => {
    const kv = (sec.kv || []).map(m => `<div class="kv"><span class="k">${esc(m.label)}</span><span class="v">${fmt(m.value)}</span></div>`).join('');
    const table = sec.table ? (() => {
      const cols = sec.table.columns;
      const head = cols.map(c => `<th>${esc(c)}</th>`).join('');
      const body = (sec.table.rows || []).map(r => `<tr>${cols.map(c => `<td>${fmt((r as any)[c])}</td>`).join('')}</tr>`).join('');
      return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="muted">No data</td></tr>`}</tbody></table></div>`;
    })() : '';
    const pre = sec.pre !== undefined ? `<pre>${fmt(sec.pre)}</pre>` : '';
    return `<section><h2>${esc(sec.title)}</h2>${sec.description ? `<p class="muted">${esc(sec.description)}</p>` : ''}${kv ? `<div class="kv-grid">${kv}</div>` : ''}${table}${pre}</section>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(opts.title)}</title>
<style>
  :root{--ink:#0f172a;--muted:#475569;--line:#e2e8f0;--bg:#ffffff;--soft:#f8fafc}
  *{box-sizing:border-box} body{margin:0;font:12px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:var(--ink);background:var(--bg)}
  header{padding:20px 24px;border-bottom:2px solid var(--ink)} h1{margin:0;font-size:20px} .sub{color:var(--muted);margin-top:4px}
  main{padding:16px 24px 24px} section{margin:14px 0;page-break-inside:avoid} h2{font-size:14px;margin:0 0 6px;border-bottom:1px solid var(--line);padding-bottom:4px}
  .muted{color:var(--muted)} .kv-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:6px 12px;margin:8px 0}
  .kv{display:flex;justify-content:space-between;gap:12px;border-bottom:1px dotted var(--line);padding:2px 0}.k{color:var(--muted)} .v{font-weight:600;text-align:right;white-space:pre-wrap}
  .table-wrap{overflow:auto;margin-top:8px} table{width:100%;border-collapse:collapse;font-size:11px} th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top} th{background:var(--soft)}
  pre{background:var(--soft);border:1px solid var(--line);padding:8px;border-radius:4px;white-space:pre-wrap}
  footer{position:fixed;bottom:0;left:0;right:0;padding:8px 24px;border-top:1px solid var(--line);background:#fff;color:var(--muted);font-size:10px;display:flex;justify-content:space-between;gap:12px}
  @media print{body{padding-bottom:40px} .no-print{display:none} a{color:inherit;text-decoration:none}}
</style></head><body>
<header><h1>${esc(opts.title)}</h1>${opts.subtitle ? `<div class="sub">${esc(opts.subtitle)}</div>` : ''}${metaHtml ? `<div class="kv-grid" style="margin-top:10px">${metaHtml}</div>` : ''}</header>
<main>${sectionsHtml}<p class="muted" style="margin-top:16px">${esc(EXPORT_DISCLAIMER)}</p></main>
<footer><span>${esc(COPYRIGHT_NOTICE)}</span><span>Generated ${esc(new Date().toISOString())}</span></footer>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) { alert('Pop-up blocked. Allow pop-ups to export PDF (print).'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
