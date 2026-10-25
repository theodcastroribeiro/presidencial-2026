import type { Scope } from "./ui-types";
import type { OfficialFirstRoundResult } from "./first-round-results";

export type ShareProgressChart = {
  svg: string | null;
  title: string;
  summary: string;
  note: string;
  sourceUrl: string;
  sourceAt: string | null;
  scopeCode: string;
};

export type ShareImageInput = {
  scope: Scope;
  title: string;
  regions: Scope[];
  national: Scope | null;
  reference: { lulaPercent: number | null; bolsonaroPercent: number | null } | null;
  axisLabel: string;
  chartSvg: string | null;
  chartNote: string;
  stale: boolean;
  capturedAt: string;
  firstRound?: OfficialFirstRoundResult | null;
  progressChart?: ShareProgressChart | null;
};
export type ShareImageResult = { blob: Blob; filename: string };

const WIDTH = 1600;
const MARGIN = 64;
const CONTENT = WIDTH - MARGIN * 2;
const COLORS = { bg: "#080d15", panel: "#101a28", line: "#2b3b51", text: "#f5f7fb", muted: "#b3c2d8", lula: "#ff3347", bolsonaro: "#2f8cff", yellow: "#f3d34a" };
const REGIONS = [{ code: "norte", name: "Norte" }, { code: "nordeste", name: "Nordeste" }, { code: "centro-oeste", name: "Centro-Oeste" }, { code: "sudeste", name: "Sudeste" }, { code: "sul", name: "Sul" }];
const XML_NS = "http://www.w3.org/2000/svg";
const TIMEOUT_MS = 15_000;

function escapeXml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[char] || char));
}
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0; }
function count(value: unknown): string { return finite(value) ? value.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—"; }
function percent(value: unknown): string { return finite(value) && value <= 100 ? `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : "—"; }
function localTime(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "horário indisponível";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Belem", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(value));
}
function wrap(value: unknown, maxChars: number): string[] {
  const words = String(value ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const original of words) {
    const chunks = original.match(new RegExp(`.{1,${Math.max(8, maxChars)}}`, "gu")) || [original];
    for (const word of chunks) {
      if (line && line.length + word.length + 1 > maxChars) { lines.push(line); line = ""; }
      line += `${line ? " " : ""}${word}`;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
function text(x: number, y: number, value: unknown, size = 20, color = COLORS.text, weight = 400, anchor: "start" | "middle" | "end" = "start"): string {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${escapeXml(value)}</text>`;
}
function multiline(x: number, y: number, lines: string[], size = 20, color = COLORS.muted, lineHeight = 27, weight = 400): string {
  return lines.map((line, index) => text(x, y + index * lineHeight, line, size, color, weight)).join("");
}
function rect(x: number, y: number, width: number, height: number, fill = COLORS.panel, stroke = COLORS.line, radius = 12): string {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`;
}

/** Exported SVGs must contain no external image, font, stylesheet, script or handler. */
function assertSafeSvg(markup: string): void {
  if (!/^\s*<svg\b/i.test(markup) || !/<\/svg>\s*$/i.test(markup) || markup.length > 8_000_000) throw new Error("O gráfico capturado não é um SVG válido para exportação.");
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|<(?:[\w-]+:)?(?:script|foreignObject|style|image|feImage|iframe|object|embed|audio|video|animate|animateTransform|set)\b|\son[a-z]+\s*=/i.test(markup)) throw new Error("O gráfico contém um recurso que não pode ser incluído na imagem.");
  for (const match of markup.matchAll(/\b(?:href|xlink:href)\s*=\s*(["'])(.*?)\1/gi)) {
    if (!match[2].trim().startsWith("#")) throw new Error("A exportação não aceita recursos externos no gráfico.");
  }
  for (const match of markup.matchAll(/url\(\s*([^)]+)\)/gi)) {
    const target = match[1].replace(/["']/g, "").trim();
    if (!target.startsWith("#")) throw new Error("A exportação não aceita recursos externos no gráfico.");
  }
  if (/@import|@font-face|var\(/i.test(markup)) throw new Error("O gráfico precisa ter cores e fontes locais resolvidas antes de exportar.");
}

/** Clone exactly the plotted paths, resolving presentation styles without altering their data. */
export function captureChartSvg(element: SVGSVGElement | null): string | null {
  if (!element || typeof window === "undefined") return null;
  const clone = element.cloneNode(true) as SVGSVGElement;
  const originals = [element, ...Array.from(element.querySelectorAll("*"))];
  const copies = [clone, ...Array.from(clone.querySelectorAll("*"))];
  const properties = ["fill", "fill-opacity", "color", "stop-color", "stop-opacity", "color-interpolation", "stroke", "stroke-opacity", "stroke-width", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "opacity", "font-size", "font-weight", "font-style", "letter-spacing", "text-anchor", "dominant-baseline", "visibility", "display", "paint-order", "vector-effect"];
  for (let index = 0; index < originals.length; index++) {
    const source = originals[index], target = copies[index];
    const computed = window.getComputedStyle(source);
    for (const attribute of Array.from(target.attributes)) {
      if (/^on/i.test(attribute.name) || attribute.name === "class" || attribute.name === "style") target.removeAttribute(attribute.name);
    }
    for (const property of properties) {
      let value = computed.getPropertyValue(property).trim();
      if (!value) continue;
      value = value.replace(/var\(\s*(--[\w-]+)(?:\s*,\s*([^)]*))?\)/g, (_match, key: string, fallback: string | undefined) => computed.getPropertyValue(key).trim() || (key === "--lula" ? COLORS.lula : key === "--bolsonaro" ? COLORS.bolsonaro : fallback || ""));
      if (/var\(/.test(value)) throw new Error("Não foi possível resolver uma cor do gráfico.");
      target.setAttribute(property, value);
    }
    target.setAttribute("font-family", "Arial, Helvetica, sans-serif");
    if (source.tagName.toLowerCase() === "text" && (!target.getAttribute("fill") || target.getAttribute("fill") === "currentColor")) target.setAttribute("fill", computed.color || COLORS.muted);
  }
  clone.querySelectorAll("[data-share-ignore]").forEach(node => node.remove());
  const viewBox = element.viewBox?.baseVal;
  const width = viewBox?.width || element.width?.baseVal?.value || element.getBoundingClientRect().width || 960;
  const height = viewBox?.height || element.height?.baseVal?.value || element.getBoundingClientRect().height || 310;
  clone.setAttribute("xmlns", XML_NS);
  clone.setAttribute("viewBox", element.getAttribute("viewBox") || `0 0 ${width} ${height}`);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const serialized = new XMLSerializer().serializeToString(clone);
  assertSafeSvg(serialized);
  return serialized;
}

function chartMarkup(markup: string, x: number, y: number, width: number, height: number): string {
  assertSafeSvg(markup);
  // Only the outer viewport changes; every observed path and point remains the capture.
  return markup.replace(/^\s*<svg\b([^>]*)>/i, (_match, attributes: string) => {
    const cleaned = attributes.replace(/\s(?:x|y|width|height|preserveAspectRatio)\s*=\s*(["']).*?\1/gi, "");
    return `<svg${cleaned} x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet">`;
  });
}
function qualityMessages(input: ShareImageInput): string[] {
  const scope = input.scope as Scope & { warnings?: unknown[]; coverage?: { complete?: boolean } };
  const messages: string[] = [];
  if (input.stale || scope.stale) messages.push("LEITURA ANTERIOR — confira a geração da fonte; os horários identificam os dados preservados.");
  if (scope.warnings?.length || scope.coverage?.complete === false) messages.push("ATENÇÃO — este recorte possui divergência ou cobertura incompleta; valores indisponíveis aparecem como traço.");
  if ([scope.electorate, scope.pendingElectorate, scope.validVotes, scope.sectionsPercent].some(value => !finite(value))) messages.push("Há campos indisponíveis nesta captura. O traço não representa zero.");
  if (REGIONS.some(region => !input.regions.some(value => value.code === region.code)) || input.regions.some(region => { const row = region as Scope & { warnings?: unknown[]; coverage?: { complete?: boolean } }; return row.stale || row.coverage?.complete === false || Boolean(row.warnings?.length); })) messages.push("A tabela nacional possui dados regionais incompletos ou preservados; confira os horários e a cobertura no painel.");
  return messages;
}



/** Capture-only addition: observed section progress and the panel's existing scenario. */
function progressChartBlock(progress: ShareProgressChart, expectedScope: string, y: number): { markup: string; height: number } {
  if (progress.scopeCode !== expectedScope) throw new Error("A curva de avanço pertence a outro recorte. Aguarde o painel atualizar.");
  const parts: string[] = [];
  let cursor = y + 38;
  const titles = wrap(progress.title || "Avanço de seções ao longo do tempo", 94);
  parts.push(multiline(MARGIN + 24, cursor, titles, 25, COLORS.text, 33, 700));
  cursor += titles.length * 33;
  parts.push(text(MARGIN + 24, cursor, "OBSERVADO + CENÁRIO DE RITMO · estimativa própria, não é projeção do TSE", 16, COLORS.yellow, 600));
  cursor += 28;
  const summaries = wrap(progress.summary || "Resumo da estimativa indisponível nesta captura.", 130);
  parts.push(multiline(MARGIN + 24, cursor, summaries, 19, COLORS.text, 27, 500));
  cursor += summaries.length * 27 + 11;
  const plotX = MARGIN + 24, plotWidth = CONTENT - 48, plotHeight = 420;
  if (progress.svg) parts.push(chartMarkup(progress.svg, plotX, cursor, plotWidth, plotHeight));
  else {
    parts.push(rect(plotX, cursor, plotWidth, plotHeight, "#0b131f", COLORS.line, 4));
    parts.push(text(WIDTH / 2, cursor + 190, "Curva de avanço indisponível nesta captura", 25, COLORS.muted, 500, "middle"));
    parts.push(text(WIDTH / 2, cursor + 229, "Nenhuma trajetória ou estimativa foi criada para a imagem.", 19, COLORS.muted, 400, "middle"));
  }
  cursor += plotHeight + 28;
  const legends = wrap("Linha observada: seções totalizadas na fonte. Trecho tracejado e faixa, quando presentes: cenário estimado exibido no painel.", 142);
  parts.push(multiline(MARGIN + 24, cursor, legends, 17, COLORS.muted, 24));
  cursor += legends.length * 24 + 7;
  const notes = wrap(progress.note || "Limites e hipóteses indisponíveis nesta captura; consulte o painel.", 140);
  parts.push(multiline(MARGIN + 24, cursor, notes, 17, COLORS.muted, 24));
  cursor += notes.length * 24 + 9;
  const origin = wrap(`Recorte: ${progress.scopeCode} · horário da origem observada: ${localTime(progress.sourceAt)} (Belém).`, 140);
  parts.push(multiline(MARGIN + 24, cursor, origin, 16, COLORS.muted, 23));
  cursor += origin.length * 23;
  const sources = wrap(progress.sourceUrl ? `Fonte observada: ${progress.sourceUrl}` : "Endereço da fonte observada indisponível nesta captura.", 154);
  parts.push(multiline(MARGIN + 24, cursor, sources, 15, COLORS.muted, 21));
  cursor += sources.length * 21;
  const height = cursor + 22 - y;
  return { markup: rect(MARGIN, y, CONTENT, height) + parts.join(""), height };
}

/** Display-only first-round result. No shares, transfers or differences are calculated here. */
function firstRoundBlock(input: ShareImageInput, y: number): { markup: string; height: number } {
  const result = input.firstRound;
  const absent = !result || result.code !== input.scope.code || result.electionId !== "6257" || result.year !== 2026 || result.round !== 1;
  const title = `Resultado oficial · primeiro turno · 2026 · ${absent ? input.title : result.name}`;
  const titleLines = wrap(title, 99);
  const parts: string[] = [];
  let cursor = y + 37;
  parts.push(multiline(MARGIN + 24, cursor, titleLines, 25, COLORS.text, 33, 700));
  cursor += titleLines.length * 33;
  if (absent) {
    const reason = result && result.code !== input.scope.code
      ? "O resultado do primeiro turno recebido pertence a outro recorte e não foi incluído."
      : "Resultado do primeiro turno indisponível nesta captura. Nenhum valor foi preenchido.";
    const lines = wrap(reason, 133);
    parts.push(multiline(MARGIN + 24, cursor, lines, 19, COLORS.muted, 27));
    cursor += lines.length * 27;
    parts.push(text(MARGIN + 24, cursor + 4, "Eleição TSE 6257 · cargo Presidente · primeiro turno de 04/10/2026", 17, COLORS.muted));
    const height = cursor + 30 - y;
    return { markup: rect(MARGIN, y, CONTENT, height) + parts.join(""), height };
  }

  const aggregated = result.aggregation || result.kind === "region";
  const statusLines = wrap(aggregated
    ? "Agregado do painel a partir das UFs. Contagens somadas e percentuais derivados sobre todos os votos válidos; não é um arquivo regional publicado pelo TSE."
    : "Valores publicados pelo TSE para este recorte. Percentuais sobre todos os votos válidos, incluindo todos os candidatos.", 136);
  parts.push(multiline(MARGIN + 24, cursor, statusLines, 17, COLORS.muted, 24));
  cursor += statusLines.length * 24 + 5;
  const denominatorLines = wrap(`Denominador: ${result.denominatorLabel || "todos os votos válidos do recorte"}. Votos válidos: ${count(result.validVotes)}. Eleitorado apto: ${count(result.electorate)}.`, 134);
  parts.push(multiline(MARGIN + 24, cursor, denominatorLines, 17, COLORS.muted, 24));
  cursor += denominatorLines.length * 24 + 5;
  const fullCount = finite(result.sections) && result.sections > 0 && finite(result.sectionsProcessed) && result.sectionsProcessed === result.sections;
  const confirmed = result.final && result.complete && result.coverage.complete && fullCount && result.sectionsPercent === 100 && (result.official || aggregated);
  // A rounded partial must never become a claim of 100% totalization.
  const roundsToHundred = finite(result.sectionsPercent) && Math.round(result.sectionsPercent * 100) === 10000;
  const sectionsLabel = roundsToHundred && !confirmed ? "totalização de 100% não confirmada" : percent(result.sectionsPercent);
  const status = confirmed ? "Final confirmado" : "Totalização final não confirmada neste recorte";
  const sectionsLines = wrap(`${status} · seções totalizadas: ${sectionsLabel} · ${count(result.sectionsProcessed)} de ${count(result.sections)} seções.`, 135);
  parts.push(multiline(MARGIN + 24, cursor, sectionsLines, 18, COLORS.text, 25, 500));
  cursor += sectionsLines.length * 25 + 5;
  parts.push(text(MARGIN + 24, cursor, "Eleição TSE 6257 · Presidente · primeiro turno de 04/10/2026", 17, COLORS.muted));
  cursor += 25;
  const sourceTime = aggregated
    ? result.sourceRange?.earliest || result.sourceRange?.latest
      ? `Gerações das UFs (intervalo): ${localTime(result.sourceRange.earliest)} a ${localTime(result.sourceRange.latest)} (Belém)`
      : "Gerações das UFs: consulte os horários individuais nas fontes abaixo."
    : `Geração da fonte TSE: ${localTime(result.sourceUpdatedAt)} (Belém)`;
  const timeLines = wrap(sourceTime, 142);
  parts.push(multiline(MARGIN + 24, cursor, timeLines, 17, COLORS.muted, 24));
  cursor += timeLines.length * 24 + 1;
  parts.push(text(MARGIN + 24, cursor, `Consulta da fonte: ${localTime(result.sourceFetchedAt)} (Belém)`, 17, COLORS.muted));
  cursor += 25;

  const warnings = [...result.warnings];
  if (!result.complete || !result.coverage.complete) warnings.push(`Cobertura incompleta: ${count(result.coverage.available)} de ${count(result.coverage.expected)} fontes disponíveis${result.coverage.missing.length ? "; ausentes: " + result.coverage.missing.join(", ") : ""}.`);
  if (!result.candidates.length) warnings.push("Lista de candidatos indisponível; nenhum candidato ou voto foi acrescentado.");
  const sources = result.sources.filter(source => typeof source.url === "string" && source.url.length > 0);
  if (aggregated ? !sources.length : !result.sourceUrl) warnings.push("Arquivo da fonte indisponível nesta captura.");
  if (!aggregated && !result.sourceUpdatedAt) warnings.push("Horário de geração da fonte indisponível nesta captura.");
  if (aggregated && !result.sourceRange?.earliest && !result.sourceRange?.latest && !sources.some(source => source.generatedAt)) warnings.push("Horários das gerações das UFs indisponíveis nesta captura.");
  if (warnings.length) {
    const warningLines = [...new Set(warnings)].flatMap(warning => wrap(warning, 134));
    parts.push(multiline(MARGIN + 24, cursor, warningLines, 17, "#f5dca4", 24, 500));
    cursor += warningLines.length * 24 + 7;
  }
  cursor += 7;
  const numberX = MARGIN + 24, nameX = MARGIN + 114, votesX = MARGIN + 1130, percentX = WIDTH - MARGIN - 24;
  parts.push(text(numberX, cursor, "NÚMERO", 14, COLORS.muted, 700));
  parts.push(text(nameX, cursor, "CANDIDATURA · ORDEM NUMÉRICA", 14, COLORS.muted, 700));
  parts.push(text(votesX, cursor, "VOTOS", 14, COLORS.muted, 700, "end"));
  parts.push(text(percentX, cursor, "% DOS VÁLIDOS", 14, COLORS.muted, 700, "end"));
  cursor += 13;
  const candidates = result.candidates.slice().sort((a, b) => {
    const aNumber = /^\d+$/.test(a.number) ? Number(a.number) : Number.POSITIVE_INFINITY;
    const bNumber = /^\d+$/.test(b.number) ? Number(b.number) : Number.POSITIVE_INFINITY;
    return aNumber - bNumber || a.number.localeCompare(b.number);
  });
  for (const candidate of candidates) {
    const names = wrap(candidate.name || candidate.fullName || "Nome indisponível", 76);
    const detail = [candidate.party, candidate.fullName && candidate.fullName !== candidate.name ? candidate.fullName : ""].filter(Boolean).join(" · ");
    const detailLines = detail ? wrap(detail, 102) : [];
    const rowHeight = Math.max(49, names.length * 25 + detailLines.length * 21 + 15);
    const baseline = cursor + 25;
    const candidateColor = candidate.number === "13" ? COLORS.lula : candidate.number === "22" ? COLORS.bolsonaro : COLORS.text;
    parts.push(`<path d="M${numberX} ${cursor}H${percentX}" stroke="${COLORS.line}"/>`);
    parts.push(text(numberX, baseline, candidate.number, 20));
    parts.push(multiline(nameX, baseline, names, 20, COLORS.text, 25, 500));
    if (detailLines.length) parts.push(multiline(nameX, baseline + names.length * 25, detailLines, 15, COLORS.muted, 21));
    parts.push(text(votesX, baseline, count(candidate.votes), 20, COLORS.text, 500, "end"));
    const rawPublished = candidate.publishedPercent ?? candidate.publishedPercentExact;
    const published = !aggregated && typeof rawPublished === "string" && /^\d+(?:[,.]\d+)?$/.test(rawPublished.trim())
      ? percent(Number(rawPublished.replace(",", "."))) : percent(candidate.percent);
    parts.push(text(percentX, baseline, published, 20, candidateColor, 500, "end"));
    cursor += rowHeight;
  }
  cursor += 23;
  if (aggregated) {
    parts.push(text(numberX, cursor, "Fontes TSE das UFs deste agregado (gerações individuais):", 16, COLORS.muted, 700));
    cursor += 23;
    for (const source of sources) {
      const lines = wrap(`${source.code}: ${source.url} · ${localTime(source.generatedAt)} (Belém)`, 155);
      parts.push(multiline(numberX, cursor, lines, 15, COLORS.muted, 21));
      cursor += lines.length * 21;
    }
  } else if (result.sourceUrl) {
    const lines = wrap(`Fonte TSE: ${result.sourceUrl}`, 155);
    parts.push(multiline(numberX, cursor, lines, 15, COLORS.muted, 21));
    cursor += lines.length * 21;
  }
  const height = cursor + 20 - y;
  return { markup: rect(MARGIN, y, CONTENT, height) + parts.join(""), height };
}

/** A standalone snapshot layout. This function does not fetch, estimate or normalize vote shares. */
export function buildShareSvg(input: ShareImageInput): string {
  const scope = input.scope;
  const parts: string[] = [];
  const titleLines = wrap(input.title || scope.name || scope.code, 53);
  const qualityLines = qualityMessages(input).flatMap(message => wrap(message, 130));
  const headerExtra = (titleLines.length - 1) * 50;
  const qualityHeight = qualityLines.length ? qualityLines.length * 25 + 24 : 0;
  parts.push(text(MARGIN, 44, "OBSERVATÓRIO  /  PRESIDENCIAL 2026", 20, COLORS.muted, 700));
  parts.push(multiline(MARGIN, 94, titleLines, 46, COLORS.text, 50, 700));
  const sourceLabel = scope.official ? "TSE" : "Recorte agregado · última fonte";
  parts.push(text(MARGIN, 130 + headerExtra, `${sourceLabel}: ${localTime(scope.sourceUpdatedAt)}  ·  Captura: ${localTime(input.capturedAt)} (Belém)`, 18, COLORS.muted));
  parts.push(text(MARGIN, 157 + headerExtra, scope.official ? "Parcial observada · segundo turno · dados oficiais da origem" : "Agregado do painel · UFs podem ter horários de geração distintos", 17, COLORS.muted));
  if (qualityLines.length) {
    parts.push(rect(MARGIN, 174 + headerExtra, CONTENT, qualityHeight, "#2b2219", "#8f713a", 8));
    parts.push(multiline(MARGIN + 18, 200 + headerExtra, qualityLines, 18, "#f5dca4", 25, 500));
  }
  const metricsY = 180 + headerExtra + qualityHeight + (qualityHeight ? 12 : 0);
  const gap = 16, metricWidth = (CONTENT - gap * 3) / 4;
  const metrics = [
    ["SEÇÕES TOTALIZADAS", percent(scope.sectionsPercent), `${count(scope.sectionsProcessed)} de ${count(scope.sections)} seções`],
    ["ELEITORADO APTO", count(scope.electorate), "Total de eleitores neste recorte"],
    ["ELEITORADO PENDENTE", count(scope.pendingElectorate), "Eleitores de seções não totalizadas"],
    ["VOTOS VÁLIDOS", count(scope.validVotes), "Votos válidos da parcial capturada"],
  ];
  metrics.forEach((metric, index) => {
    const x = MARGIN + index * (metricWidth + gap);
    parts.push(rect(x, metricsY, metricWidth, 98));
    parts.push(text(x + 18, metricsY + 28, metric[0], 14, COLORS.muted, 700));
    parts.push(text(x + 18, metricsY + 67, metric[1], 34, COLORS.text, 700));
    parts.push(text(x + 18, metricsY + 91, metric[2], 15, COLORS.muted));
  });
  const cardsY = metricsY + 116, cardWidth = (CONTENT - 22) / 2;
  (["lula", "bolsonaro"] as const).forEach((person, index) => {
    const lula = person === "lula", color = lula ? COLORS.lula : COLORS.bolsonaro, x = MARGIN + index * (cardWidth + 22);
    parts.push(rect(x, cardsY, cardWidth, 177));
    parts.push(`<path d="M${x + 13} ${cardsY + 1}H${x + cardWidth - 13}" stroke="${color}" stroke-width="4"/>`);
    parts.push(text(x + 22, cardsY + 36, lula ? "LULA  ·  13" : "FLÁVIO BOLSONARO  ·  22", 25, COLORS.text, 700));
    parts.push(text(x + 22, cardsY + 106, percent(lula ? scope.lulaPercent : scope.bolsonaroPercent), 64, color, 700));
    parts.push(text(x + cardWidth - 22, cardsY + 86, count(lula ? scope.lulaVotes : scope.bolsonaroVotes), 27, COLORS.text, 700, "end"));
    parts.push(text(x + cardWidth - 22, cardsY + 113, "votos na parcial", 17, COLORS.muted, 400, "end"));
    parts.push(text(x + 22, cardsY + 151, `Final 2022 · ${lula ? "Lula" : "Jair Bolsonaro"}: ${percent(lula ? input.reference?.lulaPercent : input.reference?.bolsonaroPercent)}`, 19, color));
  });
  const chartY = cardsY + 193;
  const chartNoteLines = wrap(input.chartNote || "Gráfico observado conforme o recorte e o eixo selecionados no painel.", 139);
  const plotX = MARGIN + 24, plotY = chartY + 61, plotWidth = CONTENT - 48, plotHeight = 440;
  const legendY = plotY + plotHeight + 25;
  const axisY = legendY + 31;
  const noteY = axisY + 31;
  const chartHeight = noteY - chartY + chartNoteLines.length * 24 + 17;
  parts.push(rect(MARGIN, chartY, CONTENT, chartHeight));
  parts.push(text(MARGIN + 24, chartY + 36, "Curva da votação · captura do gráfico exibido", 25, COLORS.text, 700));
  if (input.chartSvg) parts.push(chartMarkup(input.chartSvg, plotX, plotY, plotWidth, plotHeight));
  else {
    parts.push(rect(plotX, plotY, plotWidth, plotHeight, "#0b131f", COLORS.line, 4));
    parts.push(text(WIDTH / 2, plotY + 205, "Gráfico indisponível nesta captura", 27, COLORS.muted, 500, "middle"));
    parts.push(text(WIDTH / 2, plotY + 245, "Nenhum ponto ou curva foi acrescentado à imagem.", 20, COLORS.muted, 400, "middle"));
  }
  parts.push(`<circle cx="${MARGIN + 31}" cy="${legendY - 6}" r="6" fill="${COLORS.lula}"/>` + text(MARGIN + 46, legendY, "Lula", 18, COLORS.lula));
  parts.push(`<circle cx="${MARGIN + 147}" cy="${legendY - 6}" r="6" fill="${COLORS.bolsonaro}"/>` + text(MARGIN + 162, legendY, "Bolsonaro", 18, COLORS.bolsonaro));
  parts.push(`<path d="M${MARGIN + 330} ${legendY - 6}h42" stroke="${COLORS.text}" stroke-width="3"/>` + text(MARGIN + 384, legendY, "Hoje · 2026", 18, COLORS.muted));
  parts.push(`<path d="M${MARGIN + 558} ${legendY - 6}h42" stroke="${COLORS.text}" stroke-width="2" stroke-dasharray="6 6"/>` + text(MARGIN + 612, legendY, "2022 · tracejado, quando exibido", 18, COLORS.muted));
  parts.push(text(MARGIN + 24, axisY, `Eixo horizontal: ${input.axisLabel || "avanço da apuração"}`, 18, COLORS.muted));
  parts.push(multiline(MARGIN + 24, noteY, chartNoteLines, 17, COLORS.muted, 24));
  let tableY = chartY + chartHeight + 22;
  if (input.progressChart) {
    const progress = progressChartBlock(input.progressChart, input.scope.code, tableY);
    parts.push(progress.markup);
    tableY += progress.height + 22;
  }
  const tableHeight = 259;
  parts.push(rect(MARGIN, tableY, CONTENT, tableHeight));
  parts.push(text(MARGIN + 24, tableY + 37, "Brasil · votação nas cinco regiões", 25, COLORS.text, 700));
  const columnX = [MARGIN + 24, MARGIN + 640, MARGIN + 860, MARGIN + 1080, MARGIN + CONTENT - 24];
  ["REGIÃO", "LULA", "FLÁVIO", "APURADO", "ELEITORADO PENDENTE"].forEach((label, index) => parts.push(text(columnX[index], tableY + 73, label, 14, index === 1 ? COLORS.lula : index === 2 ? COLORS.bolsonaro : COLORS.muted, 700, index ? "end" : "start")));
  REGIONS.forEach((region, index) => {
    const row = input.regions.find(item => item.code === region.code);
    const y = tableY + 109 + index * 33;
    parts.push(`<path d="M${MARGIN + 24} ${y + 9}H${WIDTH - MARGIN - 24}" stroke="${COLORS.line}"/>`);
    parts.push(text(columnX[0], y, `${region.name}${row?.stale ? " · anterior" : (row as Scope & { coverage?: { complete?: boolean } } | undefined)?.coverage?.complete === false ? " · parcial" : ""}`, 20));
    parts.push(text(columnX[1], y, percent(row?.lulaPercent), 20, COLORS.lula, 600, "end"));
    parts.push(text(columnX[2], y, percent(row?.bolsonaroPercent), 20, COLORS.bolsonaro, 600, "end"));
    parts.push(text(columnX[3], y, percent(row?.sectionsPercent), 20, COLORS.text, 400, "end"));
    parts.push(text(columnX[4], y, count(row?.pendingElectorate), 20, COLORS.text, 400, "end"));
  });
  const firstRoundY = tableY + tableHeight + 22;
  const firstRound = firstRoundBlock(input, firstRoundY);
  parts.push(firstRound.markup);
  const footerY = firstRoundY + firstRound.height + 24;
  const footerLines = wrap(`Regiões são agregados de UFs em horários distintos. Eleitorado pendente não equivale a votos restantes. Brasil · fonte: ${localTime(input.national?.sourceUpdatedAt)} (Belém).`, 145);
  parts.push(multiline(MARGIN, footerY, footerLines, 17, COLORS.muted, 24));
  const bottom = footerY + footerLines.length * 24 + 10;
  parts.push(text(MARGIN, bottom, "2022: Lula × Jair Bolsonaro. 2026: Lula × Flávio Bolsonaro.  ·  Fonte: Tribunal Superior Eleitoral", 17, COLORS.muted));
  const height = Math.ceil(bottom + 40);
  return `<svg xmlns="${XML_NS}" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="${escapeXml(`Apuração presidencial: ${input.title}`)}"><title>${escapeXml(`Observatório — ${input.title}`)}</title><desc>${escapeXml(`Captura de ${localTime(input.capturedAt)}, Belém. Dados de ${scope.name}.`)}</desc><rect width="${WIDTH}" height="${height}" fill="${COLORS.bg}"/>${parts.join("")}</svg>`;
}

function freezeInput(input: ShareImageInput): ShareImageInput {
  const copied: ShareImageInput = { ...input, scope: { ...input.scope }, regions: input.regions.map(region => ({ ...region })), national: input.national ? { ...input.national } : null, reference: input.reference ? { ...input.reference } : null, firstRound: input.firstRound ? structuredClone(input.firstRound) : null, progressChart: input.progressChart ? { ...input.progressChart } : null };
  const freezeNested = (value: unknown): void => {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
    for (const item of Object.values(value)) freezeNested(item);
    Object.freeze(value);
  };
  freezeNested(copied.firstRound);
  freezeNested(copied.progressChart);
  Object.freeze(copied.scope);
  copied.regions.forEach(Object.freeze);
  Object.freeze(copied.regions);
  if (copied.national) Object.freeze(copied.national);
  if (copied.reference) Object.freeze(copied.reference);
  return Object.freeze(copied);
}
function safeFilename(input: ShareImageInput): string {
  const scope = (input.scope.code || input.title || "recorte").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56) || "recorte";
  let stamp = "horario-indisponivel";
  if (Number.isFinite(Date.parse(input.capturedAt))) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Belem", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(input.capturedAt));
    const part = (name: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === name)?.value || "00";
    stamp = `${part("year")}${part("month")}${part("day")}-${part("hour")}${part("minute")}${part("second")}`;
  }
  return `apuracao-presidencial-${scope}-${stamp}.png`;
}

/** Browser-only PNG renderer. All values and chart geometry are frozen before the first await. */
export async function renderShareImage(input: ShareImageInput): Promise<ShareImageResult> {
  const frozen = freezeInput(input);
  const svg = buildShareSvg(frozen);
  const filename = safeFilename(frozen);
  if (typeof document === "undefined" || typeof Image === "undefined") throw new Error("A exportação da imagem precisa ser executada no navegador.");
  const dimensions = /<svg[^>]+height="(\d+)"/.exec(svg);
  const height = dimensions ? Number(dimensions[1]) : 1600;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  const image = new Image();
  const canvas = document.createElement("canvas");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("O tempo para renderizar a imagem foi excedido. Tente novamente.")), TIMEOUT_MS);
      image.onload = () => { if (timer) clearTimeout(timer); resolve(); };
      image.onerror = () => { if (timer) clearTimeout(timer); reject(new Error("Não foi possível renderizar o gráfico capturado. Tente novamente.")); };
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("A imagem capturada não possui dimensões válidas.");
    canvas.width = WIDTH;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Este navegador não disponibilizou o renderizador de imagem.");
    context.drawImage(image, 0, 0, WIDTH, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("O tempo para gerar o PNG foi excedido. Tente novamente.")), TIMEOUT_MS);
      try {
        canvas.toBlob(value => { if (timer) clearTimeout(timer); if (value) resolve(value); else reject(new Error("Não foi possível gerar o arquivo PNG.")); }, "image/png");
      } catch { if (timer) clearTimeout(timer); reject(new Error("O navegador bloqueou a conversão da imagem capturada.")); }
    });
    return { blob, filename };
  } finally {
    if (timer) clearTimeout(timer);
    image.onload = null;
    image.onerror = null;
    image.src = "";
    URL.revokeObjectURL(url);
    canvas.width = 0;
    canvas.height = 0;
  }
}
