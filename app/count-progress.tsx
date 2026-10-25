"use client";

import { useId, useState } from "react";
import { Activity, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import type { CountProgressModel } from "../lib/count-progress";
import "./count-progress.css";

type Props = { model: CountProgressModel; title: string; scopeCode: string };
type InspectPoint = { key: string; time: number; percent: number; phase: "observed" | "forecast"; low?: number; high?: number; capped?: boolean };
const pct = (value: number | undefined) => value == null ? "—" : value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
const time = (value: number | string | null, full = false) => value == null ? "horário não informado" : new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Belem", ...(full ? { day: "2-digit", month: "2-digit", year: "numeric" } : {}),
  hour: "2-digit", minute: "2-digit", ...(full ? { second: "2-digit" } : {}), hour12: false,
}).format(new Date(value));

export function CountProgress({ model, title, scopeCode }: Props) {
  const headingId = useId(), rangeId = useId(), summaryId = useId();
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ scope: string; key: string } | null>(null);
  const domain = model.domain;
  const visible = domain ? model.observed.filter(point => point.time >= domain.from) : [];
  const inspect: InspectPoint[] = [
    ...visible.map(point => ({ key: "observed:" + point.time, time: point.time, percent: point.percent, phase: "observed" as const })),
    ...model.forecast.filter(point => point.minutes > 0).map(point => ({ ...point, key: "forecast:" + point.time, phase: "forecast" as const })),
  ];
  const defaultIndex = Math.max(0, visible.length - 1);
  const activeKey = hoveredKey || (selection?.scope === scopeCode ? selection.key : null);
  const matchingIndex = activeKey ? inspect.findIndex(point => point.key === activeKey) : -1;
  const activeIndex = matchingIndex < 0 ? defaultIndex : matchingIndex;
  const active = inspect[activeIndex];
  const last = model.observed.at(-1), end = model.forecast.at(-1);
  const ready = !!scopeCode && model.scopeCode === scopeCode;
  const W = 600, H = 310, L = 50, R = 21, T = 23, B = 42;
  const x = (value: number) => domain ? L + (value - domain.from) / (domain.to - domain.from) * (W - L - R) : L;
  const y = (value: number) => T + (100 - value) / 100 * (H - T - B);
  const observedPath = visible.map((point, index) => `${index === 0 || point.breakBefore ? "M" : "L"}${x(point.time).toFixed(2)},${y(point.percent).toFixed(2)}`).join(" ");
  const forecastPath = model.forecast.map((point, index) => `${index ? "L" : "M"}${x(point.time).toFixed(2)},${y(point.percent).toFixed(2)}`).join(" ");
  const band = model.forecast.length ? model.forecast.map((point, index) => `${index ? "L" : "M"}${x(point.time).toFixed(2)},${y(point.high).toFixed(2)}`).join(" ")
    + " " + [...model.forecast].reverse().map(point => `L${x(point.time).toFixed(2)},${y(point.low).toFixed(2)}`).join(" ") + " Z" : "";
  const selectIndex = (index: number) => {
    const point = inspect[Math.max(0, Math.min(inspect.length - 1, index))];
    if (point) { setHoveredKey(null); setSelection({ scope: scopeCode, key: point.key }); }
  };
  const nearestIndex = (clientX: number, svg: SVGSVGElement) => {
    const rect = svg.getBoundingClientRect();
    const chartX = (clientX - rect.left) / rect.width * W;
    return inspect.reduce((nearest, point, index) => Math.abs(x(point.time) - chartX) < Math.abs(x(inspect[nearest].time) - chartX) ? index : nearest, 0);
  };
  const activeDescription = active ? active.phase === "observed"
    ? "Observado: " + pct(active.percent) + " das seções, " + time(active.time, true) + "."
    : active.percent === 100 ? "Cenário no teto visual de 100%, " + time(active.time, true) + ". Horário de conclusão não estimado."
    : "Cenário de ritmo: " + pct(active.percent) + ", faixa " + pct(active.low) + " a " + pct(active.high) + ", " + time(active.time, true) + (active.capped ? ". O teto do eixo não confirma conclusão." : ".") : "Sem ponto observado disponível.";
  return <article className="count-progress" id="apuracao-projetada" aria-labelledby={headingId}
    data-share-scope={scopeCode} data-share-ready={ready ? "true" : "false"}
    data-progress-title={"Projeção da apuração · " + title} data-progress-summary={model.summary}
    data-progress-note={model.note + " " + model.method + (model.clock === "recorded" ? " Geração mais recente entre as UFs do último registro: " + time(model.sourceAt, true) + ", Belém; não é uma geração regional simultânea." : "") + (model.reason ? " " + model.reason : "")}
    data-progress-source-url={model.sourceUrl || ""} data-progress-source-at={model.clock === "recorded" ? "" : model.sourceAt || ""}>
    <div className="cp-heading"><div><span className="cp-eyebrow">SEÇÕES TOTALIZADAS × HORÁRIO</span><h2 id={headingId}>Projeção da apuração <span>· {title}</span></h2></div><Activity size={18} aria-hidden="true"/></div>
    <div className="cp-metrics"><div><span>ÚLTIMO REGISTRO</span><strong>{pct(last?.percent)}</strong><small>{last ? time(last.time) + " · Belém" : "Aguardando leitura"}</small></div><div><span>CENÁRIO EM 30 MIN</span><strong className="cp-forecast-value">{pct(end?.percent)}</strong><small>{end ? end.percent === 100 ? "Teto do cenário; sem horário de conclusão" : time(end.time) + " · desde o último registro" : model.status === "finished" ? "Totalização concluída" : "Estimativa " + (model.status === "waiting" ? "aguardando base" : "suspensa")}</small></div></div>
    <p className="cp-summary" id={summaryId}>{model.summary}</p>
    {domain && visible.length ? <svg className="count-progress-chart" data-share-scope={scopeCode} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={"Percentual de seções totalizadas por horário em " + title} aria-describedby={summaryId}
      onPointerMove={event => { if (event.pointerType !== "touch" && inspect.length) setHoveredKey(inspect[nearestIndex(event.clientX, event.currentTarget)].key); }} onPointerLeave={() => setHoveredKey(null)}
      onClick={event => { if (inspect.length) selectIndex(nearestIndex(event.clientX, event.currentTarget)); }}>
      <desc>{model.note} {model.summary}</desc>
      {[0, 25, 50, 75, 100].map(value => <g key={value}><line x1={L} x2={W - R} y1={y(value)} y2={y(value)} stroke="#29394b" strokeDasharray={value === 100 ? "3 5" : undefined}/><text x={L - 9} y={y(value) + 4} textAnchor="end" fill="#a7bdd5">{value}%</text></g>)}
      {[0, 1, 2, 3].map(index => { const value = domain.from + (domain.to - domain.from) * index / 3; return <g key={index}><line x1={x(value)} x2={x(value)} y1={T} y2={H - B} stroke="#1f3043"/><text x={x(value)} y={H - 15} textAnchor="middle" fill="#a7bdd5">{time(value)}</text></g>; })}
      {last && <line x1={x(last.time)} x2={x(last.time)} y1={T} y2={H - B} stroke="#628091" strokeDasharray="3 6"/>}
      {band && <path d={band} fill="#41deed" fillOpacity=".16" stroke="none"/>}
      <path d={observedPath} fill="none" stroke="#f2f6fb" strokeWidth="3" strokeLinejoin="round"/>
      {visible.map(point => <circle key={point.time} cx={x(point.time)} cy={y(point.percent)} r="2.6" fill="#f2f6fb"/>)}
      {forecastPath && <path d={forecastPath} fill="none" stroke="#41deed" strokeWidth="3" strokeDasharray="7 6"/>}
      {active && <g data-share-ignore="true"><line x1={x(active.time)} x2={x(active.time)} y1={T} y2={H - B} stroke="#a9becf" strokeDasharray="2 5"/><circle cx={x(active.time)} cy={y(active.percent)} r="5" fill={active.phase === "observed" ? "#fff" : "#41deed"} stroke="#0b1521" strokeWidth="2"/></g>}
    </svg> : <div className="cp-empty">A curva aparece com o primeiro percentual de seções disponível.</div>}
    <div className="cp-legend"><span><i className="cp-line"/>Observado</span><span><i className="cp-line cp-dashed"/>Cenário central</span><span><i className="cp-band"/>Faixa de ritmos</span></div>
    <p className="cp-axis-label">{model.clockLabel} · Belém · janela exibida de até 60 min observados + 30 min de cenário</p>
    {inspect.length > 0 && <div className="cp-inspector"><div><label htmlFor={rangeId}>Ler um ponto</label><span>Toque no gráfico ou use as setas</span></div><div className="cp-range"><button type="button" aria-label="Ponto anterior" onClick={() => selectIndex(activeIndex - 1)} disabled={activeIndex === 0}><ChevronLeft size={16} aria-hidden="true"/></button><input id={rangeId} type="range" min={0} max={Math.max(0, inspect.length - 1)} step={1} value={Math.min(activeIndex, inspect.length - 1)} aria-valuetext={activeDescription} onChange={event => selectIndex(Number(event.target.value))}/><button type="button" aria-label="Próximo ponto" onClick={() => selectIndex(activeIndex + 1)} disabled={activeIndex === inspect.length - 1}><ChevronRight size={16} aria-hidden="true"/></button></div><output htmlFor={rangeId}>{activeDescription}</output></div>}
    <div className="cp-source"><span>{model.clock === "recorded" ? "Geração mais recente entre UFs: " : "Geração TSE: "}{time(model.sourceAt, true)} · Belém</span>{model.sourceUrl && <a href={model.sourceUrl} target="_blank" rel="noreferrer">Consultar fonte <ExternalLink size={11} aria-hidden="true"/></a>}</div>
    <p className="cp-limits">Faixa de cenários do ritmo recente, sem probabilidade calibrada. O teto de 100% não confirma conclusão. Intervalos sem observação permanecem abertos.</p>
    <details className="cp-method"><summary>Método e limites da estimativa</summary><p>{model.method} {model.clock === "recorded" ? "Nas regiões, o eixo usa o horário de coleta do agregado; as UFs podem ter gerações distintas." : "O eixo observado usa o horário oficial da fonte."}</p></details>
  </article>;
}
