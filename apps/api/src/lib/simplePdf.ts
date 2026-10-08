/** Minimal dependency-free text PDF (Helvetica, A4). Non-Latin-1 characters become "?". */

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 56;
const LINE_H = 14;
const MAX_CHARS = 92;

function esc(s: string): string {
  return s.replace(/[^\x20-\x7e\xa0-\xff]/g, "?").replace(/([\\()])/g, "\\$1");
}

function wrap(line: string): string[] {
  if (line.length <= MAX_CHARS) return [line];
  const out: string[] = [];
  let rest = line;
  while (rest.length > MAX_CHARS) {
    let cut = rest.lastIndexOf(" ", MAX_CHARS);
    if (cut < MAX_CHARS / 2) cut = MAX_CHARS;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  out.push(rest);
  return out;
}

/** `lines` starting with "# " render as a larger heading. */
export function createTextPdf(lines: string[]): Buffer {
  const perPage = Math.floor((PAGE_H - 2 * MARGIN) / LINE_H);
  const flat: { text: string; heading: boolean }[] = [];
  for (const l of lines) {
    const heading = l.startsWith("# ");
    for (const w of wrap(heading ? l.slice(2) : l)) flat.push({ text: w, heading });
  }
  const pages: (typeof flat)[] = [];
  for (let i = 0; i < flat.length; i += perPage) pages.push(flat.slice(i, i + perPage));
  if (pages.length === 0) pages.push([]);

  // Object ids: 1 catalog, 2 pages, 3 font, 4 bold font, then (content, page) pairs.
  const objects: string[] = [];
  const kids: number[] = [];
  pages.forEach((page, idx) => {
    const contentId = 5 + idx * 2;
    const pageId = contentId + 1;
    kids.push(pageId);
    let stream = "BT\n";
    let y = PAGE_H - MARGIN;
    for (const l of page) {
      stream += `/${l.heading ? "F2 14" : "F1 10"} Tf 1 0 0 1 ${MARGIN} ${y} Tm (${esc(l.text)}) Tj\n`;
      y -= LINE_H;
    }
    stream += "ET";
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`;
  });
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(out, "latin1");
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}
