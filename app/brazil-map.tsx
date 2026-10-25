"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ArrowUpRight, Globe2 } from "lucide-react";
import type { Scope, Snapshot } from "../lib/ui-types";
import mapGeometry from "../public/data/brasil-ufs-map.json";
import "./brazil-map.css";

type Props = { snapshot: Snapshot | null; selectedCode: string; onSelect: (uf: string) => void };
type StateGeometry = { uf: string; name: string; path: string; label: number[] };
const STATES: StateGeometry[] = mapGeometry.states.slice().sort((a, b) => a.uf.localeCompare(b.uf));
const known = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const count = (value: number | null | undefined) => known(value) ? value.toLocaleString("pt-BR") : "—";
const percent = (value: number | null | undefined) => known(value) ? value.toLocaleString("pt-BR", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
}) + "%" : "—";

function currentDifference(scope: Scope | null | undefined): number | null {
  if (!known(scope?.validVotes) || scope.validVotes === 0 || !known(scope.lulaPercent)
    || !known(scope.bolsonaroPercent) || scope.lulaPercent > 100 || scope.bolsonaroPercent > 100) return null;
  return scope.lulaPercent - scope.bolsonaroPercent;
}
function signedDifference(value: number | null) {
  return value === null ? "—" : (value > 0 ? "+" : "") + value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }) + " p.p.";
}
function shade(scope: Scope | null | undefined) {
  const difference = currentDifference(scope);
  if (difference === null) return { fill: "#313943", label: "#ffffff" };
  // Fixed linear scale: -100 p.p. blue, 0 neutral, +100 p.p. red.
  const fraction = Math.min(100, Math.abs(difference)) / 100;
  const endpoint = difference < 0 ? [47, 140, 255] : [255, 51, 71];
  const rgb = [131, 140, 153].map((start, index) => Math.round(start + (endpoint[index] - start) * fraction));
  const linear = rgb.map((channel) => channel / 255 <= .04045 ? channel / 255 / 12.92 : ((channel / 255 + .055) / 1.055) ** 2.4);
  const luminance = .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  return { fill: "rgb(" + rgb.join(",") + ")", label: luminance > .179 ? "#000000" : "#ffffff" };
}
function generation(at: string | null | undefined) {
  if (!at || !Number.isFinite(Date.parse(at))) return "Sem geração disponível";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Belem", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date(at));
}
function labelFor(state: StateGeometry, scope: Scope | undefined) {
  const difference = currentDifference(scope);
  return state.name + " (" + state.uf + "), " + (difference === null ? "sem percentual válido disponível"
    : "Lula " + percent(scope?.lulaPercent) + ", Flávio " + percent(scope?.bolsonaroPercent)
      + ", diferença Lula menos Flávio " + signedDifference(difference))
    + ", " + (known(scope?.sectionsPercent) ? percent(scope.sectionsPercent) + " das seções apuradas" : "sem leitura de apuração")
    + (scope?.stale ? ", leitura anterior preservada" : "") + ". Selecionar estado.";
}

export function BrazilMap({ snapshot, selectedCode, onSelect }: Props) {
  const titleId = useId(), panelId = useId();
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [focusedCode, setFocusedCode] = useState<string | null>(null);
  const dfPath = useRef<SVGPathElement>(null);
  const scopes = useMemo(() => new Map((snapshot?.states || []).map((scope) => [scope.code, scope])), [snapshot]);
  const selected = STATES.some((state) => state.uf === selectedCode) ? selectedCode : "BR";
  const activeCode = hoveredCode || focusedCode || selected;
  const activeGeometry = STATES.find((state) => state.uf === activeCode);
  const scope = activeCode === "BR" ? snapshot?.national : scopes.get(activeCode);
  const difference = currentDifference(scope);
  const hasValidVotes = known(scope?.validVotes) && scope.validVotes > 0;
  const roundingNote = difference !== null && known(scope?.lulaPercent) && known(scope?.bolsonaroPercent)
    && Math.abs((Number(scope.lulaPercent.toFixed(2)) - Number(scope.bolsonaroPercent.toFixed(2))) - difference) > 1e-8;
  const df = STATES.find((state) => state.uf === "DF");
  const activate = (code: string) => onSelect(code);
  const keyActivate = (event: KeyboardEvent<SVGPathElement>, code: string) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(code); }
  };
  const reset = () => { setHoveredCode(null); setFocusedCode(null); onSelect("BR"); };

  return <section className="brazil-map" aria-labelledby={titleId}>
    <div className="brm-heading"><div><span className="brm-eyebrow">27 UNIDADES DA FEDERAÇÃO</span><h2 id={titleId}>Mapa da apuração</h2><p>A cor representa a diferença dos percentuais oficiais: Lula − Flávio.</p></div><button type="button" className="brm-reset" onClick={reset}><Globe2 size={14} aria-hidden="true"/>Brasil</button></div>
    <label className="brm-state-picker">Escolher estado<select aria-label="Estado no mapa" value={selected} onChange={(event) => { setHoveredCode(null); setFocusedCode(null); onSelect(event.target.value); }}><option value="BR">Brasil</option>{STATES.map((state) => <option key={state.uf} value={state.uf}>{state.uf} - {state.name}</option>)}</select></label>
    <div className="brm-layout">
      <div className="brm-map-column">
        <svg className="brm-svg" viewBox={mapGeometry.viewBox} aria-label="Mapa geográfico do Brasil por estado. Use Tab e Enter para selecionar uma UF." role="group">
          {STATES.map((state) => {
            const stateScope = scopes.get(state.uf), colors = shade(stateScope);
            return <path key={state.uf} ref={state.uf === "DF" ? dfPath : undefined} d={state.path} fill={colors.fill} fillRule="evenodd"
              className={"brm-uf" + (selectedCode === state.uf ? " brm-selected" : "") + (activeCode === state.uf ? " brm-active" : "") + (stateScope?.stale ? " brm-stale" : "")}
              role="button" tabIndex={0} aria-label={labelFor(state, stateScope)} aria-pressed={selectedCode === state.uf} aria-describedby={panelId}
              onPointerEnter={() => setHoveredCode(state.uf)} onPointerLeave={() => setHoveredCode(null)}
              onFocus={() => { setHoveredCode(null); setFocusedCode(state.uf); }} onBlur={() => setFocusedCode(null)}
              onClick={() => activate(state.uf)} onKeyDown={(event) => keyActivate(event, state.uf)}>
              <title>{labelFor(state, stateScope)}</title>
            </path>;
          })}
          {df && <g aria-hidden="true">
            <circle className="brm-df-hit" cx={df.label[0]} cy={df.label[1]} r={21}
              onPointerEnter={() => setHoveredCode("DF")} onPointerLeave={() => setHoveredCode(null)}
              onClick={() => { dfPath.current?.focus(); activate("DF"); }}/>
            <circle className={"brm-df-ring" + (activeCode === "DF" ? " brm-df-active" : "")} cx={df.label[0]} cy={df.label[1]} r={13}/>
          </g>}
          <g className="brm-labels" aria-hidden="true">{STATES.map((state) => {
            const color = shade(scopes.get(state.uf)).label;
            return <text key={state.uf} x={state.label[0]} y={state.label[1]} fill={color}
              stroke={color === "#ffffff" ? "#0b1119" : "#e5e9ef"}
              className={["AL", "SE", "RN", "PB"].includes(state.uf) ? "brm-small-label" : undefined}>{state.uf}</text>;
          })}</g>
        </svg>
        <div className="brm-legend" aria-label="Escala linear fixa da diferença Lula menos Flávio: de menos cem a mais cem pontos percentuais, azul para Flávio, vermelho para Lula e cinza para zero">
          <div className="brm-scale"><span>Diferença Lula − Flávio · pontos percentuais</span><i/><div><span>−100</span><span>−50</span><span>0</span><span>+50</span><span>+100</span></div><div className="brm-scale-sides"><span>Flávio à frente</span><span>Lula à frente</span></div></div>
          <span className="brm-no-data"><i/>Sem votos / sem leitura</span>
        </div>
        <p className="brm-instruction">Passe o cursor, use o teclado ou toque numa UF para consultar. O DF tem um alvo de interação ampliado; seus limites geográficos foram preservados.</p>
      </div>
      <aside className="brm-facts" id={panelId} aria-live="polite" aria-atomic="true">
        <div className="brm-facts-heading"><span className="brm-code">{activeCode}</span><div><span>{activeCode === "BR" ? "RESUMO NACIONAL" : "UNIDADE DA FEDERAÇÃO"}</span><h3>{activeGeometry?.name || "Brasil"}</h3></div></div>
        {scope?.stale && <p className="brm-stale-note">Leitura anterior preservada. Consulte a data de geração do TSE abaixo.</p>}
        {!scope && <p className="brm-empty-note">Sem leitura disponível para este recorte.</p>}
        <div className="brm-candidate-results" aria-label="Votos e percentuais oficiais, Lula e Flávio">
          <div className="brm-candidate-result brm-result-lula"><span>Lula</span><div><strong>{percent(hasValidVotes ? scope?.lulaPercent : null)}</strong><small>{count(scope?.lulaVotes)} votos oficiais</small></div></div>
          <div className="brm-candidate-result brm-result-flavio"><span>Flávio Bolsonaro</span><div><strong>{percent(hasValidVotes ? scope?.bolsonaroPercent : null)}</strong><small>{count(scope?.bolsonaroVotes)} votos oficiais</small></div></div>
        </div>
        <div className={"brm-difference " + (difference === null || difference === 0 ? "brm-difference-neutral" : difference > 0 ? "brm-difference-lula" : "brm-difference-flavio")}><span>Diferença Lula − Flávio</span><strong>{signedDifference(difference)}</strong><small>{difference === null ? "Aguardando percentuais válidos" : difference === 0 ? "Percentuais oficiais iguais" : difference > 0 ? "Lula à frente na parcial" : "Flávio à frente na parcial"}</small>{roundingNote && <small className="brm-rounding-note">Diferença calculada antes do arredondamento exibido.</small>}</div>
        <dl className="brm-metrics">
          <div className="brm-primary"><dt>Seções apuradas</dt><dd>{percent(scope?.sectionsPercent)}<small>{count(scope?.sectionsProcessed)} de {count(scope?.sections)} seções</small></dd></div>
          <div><dt>Eleitorado</dt><dd>{count(scope?.electorate)}</dd></div>
          <div><dt>Eleitores pendentes</dt><dd>{count(scope?.pendingElectorate)}</dd></div>
          <div><dt>Votos válidos</dt><dd>{count(scope?.validVotes)}</dd></div>
        </dl>
        <div className="brm-generation"><span>GERAÇÃO PUBLICADA PELO TSE</span><time dateTime={scope?.sourceUpdatedAt || undefined}>{generation(scope?.sourceUpdatedAt)}</time><small>Horário de Belém / Brasília</small></div>
        {scope?.sourceUrl && <a className="brm-source-link" href={scope.sourceUrl} target="_blank" rel="noreferrer">Conferir arquivo do TSE <ArrowUpRight size={13} aria-hidden="true"/></a>}
        {activeCode !== "BR" && <button type="button" className="brm-open" onClick={() => activate(activeCode)}>Abrir {activeGeometry?.name || activeCode}<ArrowUpRight size={14} aria-hidden="true"/></button>}
      </aside>
    </div>
    <div className="brm-footnote"><span>Escala fixa de −100 a +100 p.p., com zero neutro. A cor usa apenas os percentuais oficiais de votos, não o avanço das seções.</span><a href={mapGeometry.source.url} title={mapGeometry.source.title} target="_blank" rel="noreferrer">Malha geográfica: IBGE <ArrowUpRight size={11} aria-hidden="true"/></a></div>
  </section>;
}

export default BrazilMap;
