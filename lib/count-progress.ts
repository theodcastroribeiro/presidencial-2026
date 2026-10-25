import type { Scope } from "./ui-types";

const MINUTE = 60_000;
const MAX_GAP = 3 * MINUTE;
const WINDOW = 30 * MINUTE;
const SOURCE_MAX_AGE = 5 * MINUTE;
const HORIZON = 30;
const REGIONS = new Set(["norte", "nordeste", "centro-oeste", "sudeste", "sul"]);

type Coverage = { complete?: boolean; available?: number; expected?: number; missing?: unknown[]; stale?: unknown[] };
export type CountProgressScope = Scope & { aggregation?: boolean; coverage?: Coverage };
export type CountProgressObservation = {
  sourceUpdatedAt?: string | null;
  recordedAt?: string | null;
  sectionsPercent?: number | null;
  sections?: number | null;
  sectionsProcessed?: number | null;
  official?: boolean;
  aggregation?: boolean;
  stale?: boolean;
  code?: string;
};
export type CountProgressPoint = {
  at: string; time: number; percent: number; sourceAt: string | null; recordedAt: string | null;
  sections: number | null; sectionsProcessed: number | null; origin: "history" | "current";
  eligibleForFit: boolean; breakBefore: boolean; reset: "regression" | "denominator" | "gap" | "preserved" | null;
};
export type CountProgressForecastPoint = {
  at: string; time: number; minutes: number; percent: number; low: number; high: number;
  capped: boolean;
};
export type CountProgressModel = {
  scopeCode: string;
  available: boolean;
  status: "ready" | "waiting" | "suspended" | "finished";
  reasonCode: string | null;
  reason: string | null;
  summary: string;
  method: string;
  note: string;
  sourceUrl: string | null;
  sourceAt: string | null;
  clock: "source" | "recorded";
  clockLabel: string;
  horizonMinutes: number;
  observed: CountProgressPoint[];
  forecast: CountProgressForecastPoint[];
  rate: { q25: number; median: number; q75: number; low: number; high: number; dispersionFloor: number; windows: number } | null;
  resetAt: string | null;
  hasLegacyDenominator: boolean;
  domain: { from: number; to: number } | null;
};
export type CountProgressInput = {
  scope: CountProgressScope | null;
  observations: CountProgressObservation[];
  now: number | null;
  fetchedAt: string | null;
  historyReady: boolean;
  historyPartial: boolean;
};

const timestamp = (value: unknown): number | null => typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const validPercent = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
const integer = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const bounded = (value: number) => Math.min(100, Math.max(0, value));
const pct = (value: number) => value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

function quantile(sorted: number[], probability: number): number {
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index), fraction = index - lower;
  return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction;
}

/** Pure short-horizon scenarios of section-count progress; never estimates candidate votes. */
export function buildCountProgress(input: CountProgressInput): CountProgressModel {
  const { scope, now, fetchedAt, historyReady, historyPartial } = input;
  const regional = !!scope && (scope.aggregation === true || REGIONS.has(scope.code));
  const clock = regional ? "recorded" : "source";
  const clockLabel = regional ? "Horário de coleta do agregado regional" : "Horário oficial de geração do TSE";
  const rows: { point: CountProgressPoint; order: number }[] = [];
  const add = (row: CountProgressObservation, origin: "history" | "current", order: number) => {
    if (!validPercent(row.sectionsPercent) || (row.code && row.code !== scope?.code)) return;
    if (row.official === false && !row.aggregation) return;
    const time = timestamp(regional ? row.recordedAt : row.sourceUpdatedAt);
    if (time === null) return;
    rows.push({ order, point: {
      at: new Date(time).toISOString(), time, percent: row.sectionsPercent,
      sourceAt: timestamp(row.sourceUpdatedAt) === null ? null : row.sourceUpdatedAt!,
      recordedAt: timestamp(row.recordedAt) === null ? null : row.recordedAt!,
      sections: integer(row.sections), sectionsProcessed: integer(row.sectionsProcessed),
      origin, eligibleForFit: row.stale !== true, breakBefore: false, reset: null,
    } });
  };
  // A false readiness guard can denote an old scope still awaiting its effect; never mix it in.
  if (scope && historyReady) input.observations.forEach((row, index) => add(row, "history", index));
  if (scope && (!regional || !scope.stale)) add({
    ...scope, aggregation: regional, recordedAt: fetchedAt,
  }, "current", input.observations.length);
  rows.sort((a, b) => a.point.time - b.point.time
    || (timestamp(a.point.recordedAt) ?? a.order) - (timestamp(b.point.recordedAt) ?? b.order)
    || a.order - b.order);
  // Repeated official generation times represent the latest recorded revision, not a new instant.
  const observed: CountProgressPoint[] = [];
  for (const { point } of rows) {
    if (observed.at(-1)?.time === point.time) observed[observed.length - 1] = point;
    else observed.push(point);
  }
  let fitStart = 0, knownDenominator: number | null = null, resetAt: string | null = null;
  for (let index = 0; index < observed.length; index++) {
    const point = observed[index], previous = observed[index - 1];
    const denominatorChanged = point.sections !== null && knownDenominator !== null && point.sections !== knownDenominator;
    const regressed = !!previous && (point.percent < previous.percent - 1e-9
      || (point.sectionsProcessed !== null && previous.sectionsProcessed !== null && point.sectionsProcessed < previous.sectionsProcessed));
    const gap = !!previous && point.time - previous.time > MAX_GAP;
    point.reset = denominatorChanged ? "denominator" : regressed ? "regression" : gap ? "gap" : !point.eligibleForFit || previous?.eligibleForFit === false ? "preserved" : null;
    point.breakBefore = index === 0 || point.reset !== null;
    if (point.reset) { fitStart = point.eligibleForFit ? index : index + 1; resetAt = point.at; }
    if (point.sections !== null) knownDenominator = point.sections;
  }
  const last = observed.at(-1);
  const hasLegacyDenominator = observed.some(point => point.origin === "history" && point.sections === null);
  const method = "Cenários de 30 minutos desde o último registro, com ritmo dos últimos 30 minutos: mediana e quartis de janelas móveis de 5 a 10 minutos. Exige ao menos 6 observações e 10 minutos contínuos. A faixa usa quartis e dispersão mínima de 0,02 p.p./min ou 15% do ritmo mediano; não é intervalo de confiança nem probabilidade. Regressão, mudança conhecida no total de seções ou intervalo maior que 3 minutos reiniciam o ajuste."
    + (hasLegacyDenominator ? " Pontos legados não informam o total de seções; mudanças passadas desse denominador não podem ser verificadas nesses pontos." : "");
  const note = clockLabel + ". " + (regional ? "O agregado reúne UFs com gerações diferentes; recordedAt identifica sua coleta, não uma geração simultânea do TSE. " : "")
    + "Linha branca: percentual observado. Tracejado ciano: cenário mantendo o ritmo recente. Faixa: cenários do ritmo recente. O teto de 100% é limite visual e não confirma conclusão nem seu horário. Lacunas maiores que 3 minutos não são ligadas.";
  const domain = last ? { from: Math.min(last.time - 10 * MINUTE, Math.max(observed[0].time, last.time - 60 * MINUTE)), to: last.time + HORIZON * MINUTE } : null;
  const model: CountProgressModel = {
    scopeCode: scope?.code || "", available: false, status: "waiting", reasonCode: null, reason: null,
    summary: last ? pct(last.percent) + " das seções no último registro observado." : "Aguardando percentual de seções observado.",
    method, note, sourceUrl: scope?.sourceUrl || null, sourceAt: last?.sourceAt || scope?.sourceUpdatedAt || null,
    clock, clockLabel, horizonMinutes: HORIZON, observed, forecast: [], rate: null, resetAt, hasLegacyDenominator, domain,
  };
  const stop = (code: string, reason: string, status: "waiting" | "suspended" = "suspended") => {
    model.reasonCode = code; model.reason = reason; model.status = status;
    model.summary += " " + reason;
    return model;
  };
  if (!scope || !last) return stop("no-observations", "Aguardando registros deste recorte.", "waiting");
  if (!validPercent(scope.sectionsPercent)) return stop("invalid-current", "Estimativa suspensa: percentual atual de seções indisponível ou inválido.");
  if (last.percent === 100 && (scope.final || scope.status === "finished")) {
    model.status = "finished"; model.summary = regional ? "Agregado regional com 100% das seções totalizadas. Não há estimativa de avanço adicional." : "O TSE informa 100% das seções totalizadas. Não há estimativa de avanço adicional.";
    return model;
  }
  if (!Number.isFinite(now)) return stop("clock-unavailable", "Aguardando o horário atual para verificar a fonte.", "waiting");
  const currentNow = now!;
  const sourceTime = timestamp(scope.sourceUpdatedAt), fetchTime = timestamp(fetchedAt);
  if (scope.stale || sourceTime === null || fetchTime === null || currentNow - sourceTime > SOURCE_MAX_AGE
    || currentNow - fetchTime > SOURCE_MAX_AGE || currentNow - last.time > SOURCE_MAX_AGE) {
    return stop("stale-source", "Estimativa suspensa: fonte ou última consulta há mais de 5 minutos, ausente ou preservada.");
  }
  if (sourceTime > currentNow + MINUTE || last.time > currentNow + MINUTE) return stop("future-source", "Estimativa suspensa: horário da fonte à frente do relógio atual.");
  if (scope.coverage?.complete === false || (scope.coverage?.missing?.length ?? 0) > 0
    || (scope.coverage?.stale?.length ?? 0) > 0
    || (scope.coverage?.available != null && scope.coverage?.expected != null && scope.coverage.available < scope.coverage.expected)) {
    return stop("incomplete-coverage", "Estimativa suspensa: cobertura do recorte incompleta.");
  }
  if (historyPartial) return stop("partial-history", "Estimativa suspensa: leitura do histórico incompleta.");
  if (!historyReady) return stop("history-not-ready", "Aguardando o histórico deste recorte.", "waiting");
  if (last.percent === 100) return stop("unconfirmed-final", "O registro atingiu o teto de 100%; aguarda-se a indicação de totalização concluída.");
  const recent = observed.slice(fitStart).filter(point => point.time >= last.time - WINDOW);
  if (recent.length < 6) return stop("insufficient-points", "Estimativa aguardando ao menos 6 observações contínuas recentes.", "waiting");
  if (last.time - recent[0].time < 10 * MINUTE) return stop("insufficient-span", "Estimativa aguardando ao menos 10 minutos contínuos de observações.", "waiting");
  const rates: number[] = [];
  for (let index = 1; index < recent.length; index++) {
    const endpoint = recent[index];
    let start: CountProgressPoint | null = null;
    for (let previous = 0; previous < index; previous++) {
      const minutes = (endpoint.time - recent[previous].time) / MINUTE;
      if (minutes < 5 || minutes > 10) continue;
      if (!start || Math.abs(minutes - 7.5) < Math.abs((endpoint.time - start.time) / MINUTE - 7.5)) start = recent[previous];
    }
    if (start) rates.push(Math.max(0, (endpoint.percent - start.percent) / ((endpoint.time - start.time) / MINUTE)));
  }
  if (rates.length < 3) return stop("insufficient-windows", "Estimativa aguardando janelas observadas de 5 a 10 minutos.", "waiting");
  rates.sort((a, b) => a - b);
  const q25 = quantile(rates, 0.25), median = quantile(rates, 0.5), q75 = quantile(rates, 0.75);
  const dispersionFloor = Math.max(0.02, median * 0.15);
  const low = Math.max(0, Math.min(q25, median - dispersionFloor)), high = Math.max(q75, median + dispersionFloor);
  model.rate = { q25, median, q75, low, high, dispersionFloor, windows: rates.length };
  for (let minutes = 0; minutes <= HORIZON; minutes++) {
    const time = last.time + minutes * MINUTE;
    model.forecast.push({ time, at: new Date(time).toISOString(), minutes,
      percent: bounded(last.percent + median * minutes), low: bounded(last.percent + low * minutes),
      high: bounded(last.percent + high * minutes), capped: last.percent + high * minutes >= 100,
    });
  }
  model.available = true; model.status = "ready";
  const end = model.forecast.at(-1)!;
  model.summary = pct(last.percent) + " observado. " + (end.percent === 100
    ? "Cenário mantendo o ritmo recente alcança o teto visual de 100% dentro deste horizonte de 30 minutos; horário de conclusão não estimado."
    : "Cenário mantendo o ritmo recente, em 30 minutos desde esse registro: " + pct(end.percent)
      + "; faixa de ritmo " + pct(end.low) + " a " + pct(end.high) + "."
      + (end.capped ? " Valores no teto do eixo não confirmam conclusão." : ""));
  return model;
}
