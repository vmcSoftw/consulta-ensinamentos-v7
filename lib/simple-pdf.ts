type PdfLine = {
  text: string;
  size?: number;
  bold?: boolean;
  gapAfter?: number;
};

type PdfOptions = {
  title: string;
  subtitle?: string;
  lines: PdfLine[];
};

export type CompilationTopic = {
  year?: number | null;
  sourceType: string;
  sourceTitle: string;
  topicNumber?: string | null;
  title: string;
  content: string;
  pageStart?: number | null;
  pageEnd?: number | null;
  category?: string | null;
};

type CompilationOptions = {
  title: string;
  subtitle?: string;
  filterType?: string | null;
  filterYear?: number | null;
  topics: CompilationTopic[];
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 46;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const TOP_Y = 792;
const BOTTOM_Y = 48;

const C = {
  navy: [0.055, 0.09, 0.18] as const,
  blue: [0.18, 0.38, 0.82] as const,
  blueDark: [0.12, 0.27, 0.62] as const,
  blueLight: [0.94, 0.965, 1] as const,
  ink: [0.09, 0.12, 0.18] as const,
  muted: [0.37, 0.42, 0.5] as const,
  line: [0.86, 0.89, 0.93] as const,
  soft: [0.97, 0.975, 0.985] as const,
  white: [1, 1, 1] as const,
};

type RGB = readonly [number, number, number];

function cleanText(value: string) {
  return String(value ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[\t\r]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function pdfEscape(value: string) {
  const cleaned = cleanText(value);
  let out = '';
  for (const ch of cleaned) {
    const code = ch.codePointAt(0) ?? 63;
    if (ch === '\\') out += '\\\\';
    else if (ch === '(') out += '\\(';
    else if (ch === ')') out += '\\)';
    else if (code >= 32 && code <= 126) out += ch;
    else if (code >= 160 && code <= 255) out += `\\${code.toString(8).padStart(3, '0')}`;
    else out += '?';
  }
  return out;
}

function rgb(color: RGB) {
  return `${color[0]} ${color[1]} ${color[2]}`;
}

function approxCharCapacity(size: number, width = CONTENT_WIDTH) {
  return Math.max(18, Math.floor(width / (size * 0.52)));
}

function wrapParagraph(text: string, size: number, width = CONTENT_WIDTH) {
  const maxChars = approxCharCapacity(size, width);
  const words = cleanText(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) current = candidate;
    else {
      if (current) lines.push(current);
      if (word.length > maxChars) {
        let rest = word;
        while (rest.length > maxChars) {
          lines.push(rest.slice(0, maxChars));
          rest = rest.slice(maxChars);
        }
        current = rest;
      } else current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function textOp(text: string, x: number, y: number, size: number, bold = false, color: RGB = C.ink) {
  return `BT /${bold ? 'F2' : 'F1'} ${size.toFixed(1)} Tf ${rgb(color)} rg ${x.toFixed(1)} ${y.toFixed(1)} Td (${pdfEscape(text)}) Tj ET`;
}

function rectOp(x: number, y: number, width: number, height: number, fill: RGB, stroke?: RGB, strokeWidth = 1) {
  const ops = [`q ${rgb(fill)} rg`];
  if (stroke) ops.push(`${rgb(stroke)} RG ${strokeWidth.toFixed(1)} w`);
  ops.push(`${x.toFixed(1)} ${y.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)} re`);
  ops.push(stroke ? 'B Q' : 'f Q');
  return ops.join('\n');
}

function lineOp(x1: number, y1: number, x2: number, y2: number, color: RGB = C.line, width = 0.8) {
  return `q ${rgb(color)} RG ${width.toFixed(1)} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S Q`;
}

function splitLogicalLine(line: PdfLine) {
  const size = line.size ?? 9.5;
  const paragraphs = cleanText(line.text).split('\n');
  const rows: PdfLine[] = [];
  paragraphs.forEach((p, index) => {
    if (!p.trim()) {
      rows.push({ text: '', size, bold: line.bold, gapAfter: 3 });
      return;
    }
    const wrapped = wrapParagraph(p, size);
    wrapped.forEach((text, i) => rows.push({
      text,
      size,
      bold: line.bold,
      gapAfter: i === wrapped.length - 1 && index === paragraphs.length - 1 ? line.gapAfter : 0
    }));
  });
  return rows;
}

function paginate(lines: PdfLine[]) {
  const rows = lines.flatMap(splitLogicalLine);
  const pages: PdfLine[][] = [[]];
  let y = TOP_Y;
  for (const row of rows) {
    const size = row.size ?? 9.5;
    const lineHeight = size * 1.35;
    const needed = lineHeight + (row.gapAfter ?? 0);
    if (y - needed < BOTTOM_Y) {
      pages.push([]);
      y = TOP_Y;
    }
    pages[pages.length - 1].push(row);
    y -= needed;
  }
  return pages;
}

function pageStream(lines: PdfLine[], pageNumber: number, totalPages: number) {
  let y = TOP_Y;
  const ops: string[] = [];
  for (const line of lines) {
    const size = line.size ?? 9.5;
    if (line.text) ops.push(textOp(line.text, MARGIN_X, y, size, Boolean(line.bold)));
    y -= size * 1.35 + (line.gapAfter ?? 0);
  }
  ops.push(textOp(`Pagina ${pageNumber} de ${totalPages}`, MARGIN_X, 26, 7.5, false, C.muted));
  return ops.join('\n');
}

function makePdfFromStreams(streams: string[], title: string) {
  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

  const pageRefs: number[] = [];
  let nextObj = 5;
  streams.forEach((stream) => {
    const contentObj = nextObj++;
    const pageObj = nextObj++;
    objects[contentObj] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`;
    objects[pageObj] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObj} 0 R >>`;
    pageRefs.push(pageObj);
  });
  objects[2] = `<< /Type /Pages /Count ${pageRefs.length} /Kids [${pageRefs.map(n => `${n} 0 R`).join(' ')}] >>`;

  const infoObj = nextObj++;
  objects[infoObj] = `<< /Title (${pdfEscape(title)}) /Author (Consulta de Ensinamentos V7) /Creator (Consulta de Ensinamentos V7) >>`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 1; i < objects.length; i++) {
    if (!objects[i]) continue;
    offsets[i] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < objects.length; i++) {
    const offset = offsets[i] ?? 0;
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

export function buildTextPdf(options: PdfOptions) {
  const base: PdfLine[] = [
    { text: 'Consulta de Ensinamentos', size: 18, bold: true, gapAfter: 4 },
    { text: options.title, size: 12, bold: true, gapAfter: 3 },
    ...(options.subtitle ? [{ text: options.subtitle, size: 8.8, gapAfter: 10 } as PdfLine] : []),
    ...options.lines
  ];
  const pages = paginate(base);
  return makePdfFromStreams(pages.map((pageLines, index) => pageStream(pageLines, index + 1, pages.length)), options.title);
}

function sourceKey(topic: CompilationTopic) {
  return `${topic.year ?? ''}|${topic.sourceType}|${topic.sourceTitle}`;
}

function formatPage(topic: CompilationTopic) {
  if (!topic.pageStart) return 'Página não informada';
  if (topic.pageEnd && topic.pageEnd !== topic.pageStart) return `Páginas ${topic.pageStart}-${topic.pageEnd}`;
  return `Página ${topic.pageStart}`;
}

function uniqueSources(topics: CompilationTopic[]) {
  return new Set(topics.map(sourceKey)).size;
}

function yearRange(topics: CompilationTopic[]) {
  const years = topics.map(t => t.year).filter((y): y is number => typeof y === 'number');
  if (!years.length) return 'Sem ano';
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? String(min) : `${min} - ${max}`;
}

export function buildCompilationPdf(options: CompilationOptions) {
  type Page = { ops: string[]; kind: 'cover' | 'content' };
  const pages: Page[] = [];

  const newPage = (kind: 'cover' | 'content') => {
    const page: Page = { ops: [], kind };
    pages.push(page);
    return page;
  };

  const cover = newPage('cover');
  cover.ops.push(rectOp(0, 0, PAGE_WIDTH, PAGE_HEIGHT, C.white));
  cover.ops.push(rectOp(0, 646, PAGE_WIDTH, 196, C.navy));
  cover.ops.push(rectOp(0, 646, 9, 196, C.blue));
  cover.ops.push(textOp('CONSULTA DE ENSINAMENTOS', MARGIN_X, 794, 9.2, true, C.white));
  cover.ops.push(textOp('COMPILAÇÃO DOCUMENTAL', MARGIN_X, 768, 8.2, true, [0.66, 0.76, 0.96]));

  const coverTitle = wrapParagraph(options.title, 23, CONTENT_WIDTH - 12);
  let coverY = 728;
  for (const line of coverTitle.slice(0, 3)) {
    cover.ops.push(textOp(line, MARGIN_X, coverY, 23, true, C.white));
    coverY -= 29;
  }
  if (options.subtitle) {
    const sub = wrapParagraph(options.subtitle, 9.2, CONTENT_WIDTH - 12).slice(0, 2);
    coverY -= 2;
    for (const line of sub) {
      cover.ops.push(textOp(line, MARGIN_X, coverY, 9.2, false, [0.82, 0.86, 0.93]));
      coverY -= 13;
    }
  }

  const statY = 540;
  const gap = 12;
  const cardW = (CONTENT_WIDTH - gap * 2) / 3;
  const stats = [
    ['TÓPICOS', String(options.topics.length)],
    ['FONTES', String(uniqueSources(options.topics))],
    ['PERÍODO', yearRange(options.topics)]
  ];
  stats.forEach(([label, value], index) => {
    const x = MARGIN_X + index * (cardW + gap);
    cover.ops.push(rectOp(x, statY, cardW, 78, C.soft, C.line, 0.8));
    cover.ops.push(textOp(label, x + 14, statY + 54, 7.5, true, C.muted));
    cover.ops.push(textOp(value, x + 14, statY + 24, value.length > 12 ? 13 : 18, true, C.ink));
  });

  cover.ops.push(textOp('SOBRE ESTA COMPILAÇÃO', MARGIN_X, 472, 8.2, true, C.blueDark));
  cover.ops.push(lineOp(MARGIN_X, 462, PAGE_WIDTH - MARGIN_X, 462, C.line, 0.8));
  const intro = 'Conteúdo organizado para leitura e consulta, preservando a referência do documento de origem, o ano, a categoria e a página catalogada.';
  let introY = 438;
  for (const line of wrapParagraph(intro, 10, CONTENT_WIDTH)) {
    cover.ops.push(textOp(line, MARGIN_X, introY, 10, false, C.ink));
    introY -= 15;
  }

  const criteria: string[] = [];
  if (options.filterType) criteria.push(`Tipo: ${options.filterType}`);
  if (options.filterYear) criteria.push(`Ano: ${options.filterYear}`);
  criteria.push('Ordenação: cronológica');
  cover.ops.push(rectOp(MARGIN_X, 316, CONTENT_WIDTH, 78, C.blueLight, [0.79, 0.85, 0.97], 0.8));
  cover.ops.push(textOp('CRITÉRIOS DA GERAÇÃO', MARGIN_X + 16, 374, 7.5, true, C.blueDark));
  let criteriaY = 351;
  for (const criterion of criteria) {
    cover.ops.push(textOp(`- ${criterion}`, MARGIN_X + 16, criteriaY, 9.1, false, C.ink));
    criteriaY -= 15;
  }

  cover.ops.push(textOp('As páginas informadas correspondem ao documento original catalogado no sistema.', MARGIN_X, 86, 8.2, false, C.muted));

  let page = newPage('content');
  let y = 748;

  const drawContentHeader = (target: Page) => {
    target.ops.push(rectOp(0, 0, PAGE_WIDTH, PAGE_HEIGHT, C.white));
    target.ops.push(rectOp(0, 824, PAGE_WIDTH, 18, C.navy));
    target.ops.push(rectOp(0, 824, 128, 18, C.blue));
    target.ops.push(textOp('Consulta de Ensinamentos', MARGIN_X, 796, 9, true, C.ink));
    const shortLabel = cleanText(options.title).slice(0, 54);
    target.ops.push(textOp(shortLabel, MARGIN_X, 780, 7.6, false, C.muted));
    target.ops.push(lineOp(MARGIN_X, 766, PAGE_WIDTH - MARGIN_X, 766, C.line, 0.8));
  };

  drawContentHeader(page);

  const startContentPage = () => {
    page = newPage('content');
    drawContentHeader(page);
    y = 748;
  };

  const ensure = (height: number) => {
    if (y - height < 64) startContentPage();
  };

  const drawSourceHeader = (topic: CompilationTopic) => {
    const sourceLines = wrapParagraph(topic.sourceTitle, 8.8, CONTENT_WIDTH - 112).slice(0, 3);
    const boxH = Math.max(50, 31 + sourceLines.length * 11);
    ensure(boxH + 14);
    const boxY = y - boxH;
    page.ops.push(rectOp(MARGIN_X, boxY, CONTENT_WIDTH, boxH, C.blueLight, [0.82, 0.87, 0.97], 0.8));
    page.ops.push(rectOp(MARGIN_X, boxY, 5, boxH, C.blue));
    page.ops.push(textOp(String(topic.year ?? 'S/A'), MARGIN_X + 16, y - 22, 14, true, C.blueDark));
    page.ops.push(textOp(topic.sourceType.toUpperCase(), MARGIN_X + 16, y - 38, 7.4, true, C.muted));
    let sourceY = y - 20;
    for (const line of sourceLines) {
      page.ops.push(textOp(line, MARGIN_X + 96, sourceY, 8.8, true, C.ink));
      sourceY -= 11;
    }
    y = boxY - 14;
  };

  const drawContinuation = (topic: CompilationTopic) => {
    ensure(44);
    page.ops.push(rectOp(MARGIN_X, y - 34, CONTENT_WIDTH, 34, C.soft, C.line, 0.6));
    page.ops.push(textOp('CONTINUAÇÃO', MARGIN_X + 12, y - 14, 6.9, true, C.blueDark));
    const label = `${topic.topicNumber ? `${topic.topicNumber}. ` : ''}${topic.title}`;
    page.ops.push(textOp(cleanText(label).slice(0, 76), MARGIN_X + 12, y - 27, 8.1, true, C.ink));
    y -= 46;
  };

  let currentSource = '';
  for (const topic of options.topics) {
    if (sourceKey(topic) !== currentSource) {
      drawSourceHeader(topic);
      currentSource = sourceKey(topic);
    }

    const title = `${topic.topicNumber ? `${topic.topicNumber}. ` : ''}${topic.title}`;
    const titleLines = wrapParagraph(title, 11.2, CONTENT_WIDTH - 6);
    const titleHeight = titleLines.length * 14.2;
    ensure(titleHeight + 44);

    for (const line of titleLines) {
      page.ops.push(textOp(line, MARGIN_X, y, 11.2, true, C.ink));
      y -= 14.2;
    }

    const metaParts = [formatPage(topic)];
    if (topic.category) metaParts.push(topic.category);
    page.ops.push(textOp(metaParts.join('  |  '), MARGIN_X, y - 2, 7.8, true, C.muted));
    y -= 22;

    const paragraphs = cleanText(topic.content).split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
    for (let pIndex = 0; pIndex < paragraphs.length; pIndex++) {
      const bodyLines = wrapParagraph(paragraphs[pIndex], 9.3, CONTENT_WIDTH);
      for (let i = 0; i < bodyLines.length; i++) {
        if (y - 13 < 64) {
          startContentPage();
          drawContinuation(topic);
        }
        page.ops.push(textOp(bodyLines[i], MARGIN_X, y, 9.3, false, C.ink));
        y -= 13.1;
      }
      if (pIndex < paragraphs.length - 1) y -= 5;
    }

    y -= 7;
    ensure(16);
    page.ops.push(lineOp(MARGIN_X, y, PAGE_WIDTH - MARGIN_X, y, C.line, 0.7));
    y -= 18;
  }

  const totalPages = pages.length;
  pages.forEach((p, index) => {
    const n = index + 1;
    if (p.kind === 'cover') {
      p.ops.push(textOp(`Consulta de Ensinamentos V7  |  Página ${n} de ${totalPages}`, MARGIN_X, 36, 7.2, false, C.muted));
      p.ops.push(textOp('Documento gerado a partir do acervo catalogado.', PAGE_WIDTH - MARGIN_X - 220, 36, 7.2, false, C.muted));
    } else {
      p.ops.push(lineOp(MARGIN_X, 48, PAGE_WIDTH - MARGIN_X, 48, C.line, 0.6));
      p.ops.push(textOp(`Página ${n} de ${totalPages}`, MARGIN_X, 31, 7.4, false, C.muted));
      p.ops.push(textOp('Consulta de Ensinamentos V7', PAGE_WIDTH - MARGIN_X - 112, 31, 7.4, false, C.muted));
    }
  });

  return makePdfFromStreams(pages.map(p => p.ops.join('\n')), options.title);
}
