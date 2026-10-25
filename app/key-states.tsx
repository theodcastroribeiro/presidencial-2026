"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { Scope, Snapshot } from "../lib/ui-types";
import "./key-states.css";

type FirstRoundState = {
  uf: string;
  validVotes?: number | null;
  lulaVotes?: number | null;
  bolsonaroVotes?: number | null;
  otherVotes?: number | null;
  lulaPercent?: number | null;
  bolsonaroPercent?: number | null;
  otherPercent?: number | null;
  pairLulaPercent?: number | null;
  pairBolsonaroPercent?: number | null;
};

type Props = {
  snapshot: Snapshot | null;
  firstRound: { states?: FirstRoundState[] } | null;
  onSelect: (uf: string) => void;
};

const FOCUS_STATES = [
  { uf: "SP", name: "São Paulo" },
  { uf: "MG", name: "Minas Gerais" },
  { uf: "BA", name: "Bahia" },
] as const;

const percent = (value: number | null) => value === null ? "—" : `${value.toLocaleString("pt-BR", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
})}%`;
const known = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const count = (value: number | null | undefined) => !known(value) ? "—" : value.toLocaleString("pt-BR");
const compact = (value: number | null | undefined) => !known(value) ? "—" : value >= 1_000_000
  ? `${(value / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi` : count(value);

function share(votes: number | null | undefined, total: number | null | undefined): number | null {
  return known(votes) && known(total) && total > 0 ? votes / total * 100 : null;
}

function baselineShare(baseline: FirstRoundState | undefined, person: "lula" | "bolsonaro", pair: boolean): number | null {
  if (!baseline) return null;
  const published = pair
    ? person === "lula" ? baseline.pairLulaPercent : baseline.pairBolsonaroPercent
    : person === "lula" ? baseline.lulaPercent : baseline.bolsonaroPercent;
  if (known(published)) return published;
  const votes = person === "lula" ? baseline.lulaVotes : baseline.bolsonaroVotes;
  const total = pair && known(baseline.lulaVotes) && known(baseline.bolsonaroVotes)
    ? baseline.lulaVotes + baseline.bolsonaroVotes : pair ? null : baseline.validVotes;
  return share(votes, total);
}

function currentShare(scope: Scope | undefined, person: "lula" | "bolsonaro", pair: boolean): number | null {
  if (!scope || !known(scope.validVotes) || scope.validVotes === 0) return null;
  if (pair) {
    const total = known(scope.lulaVotes) && known(scope.bolsonaroVotes) ? scope.lulaVotes + scope.bolsonaroVotes : null;
    return share(person === "lula" ? scope.lulaVotes : scope.bolsonaroVotes, total);
  }
  const published = person === "lula" ? scope.lulaPercent : scope.bolsonaroPercent;
  return known(published) ? published : null;
}

function Difference({ before, now }: { before: number | null; now: number | null }) {
  if (before === null || now === null) return <small className="ks-difference ks-difference-empty">aguardando votos</small>;
  const delta = now - before;
  return <small className="ks-difference">{delta > 0 ? "+" : ""}{delta.toLocaleString("pt-BR", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })} p.p. entre turnos</small>;
}

export function KeyStates({ snapshot, firstRound, onSelect }: Props) {
  const [pair, setPair] = useState(true);
  return <section className="key-states" aria-labelledby="key-states-title">
    <div className="ks-section-heading">
      <div><span className="ks-eyebrow">SP · MG · BA</span><h2 id="key-states-title">Três estados em foco</h2><p>O primeiro turno de 2026 ao lado da apuração de hoje.</p></div>
      <div className="ks-mode" role="group" aria-label="Base dos percentuais comparados">
        <button type="button" className={pair ? "ks-mode-selected" : ""} aria-pressed={pair} onClick={() => setPair(true)}>Entre a dupla</button>
        <button type="button" className={!pair ? "ks-mode-selected" : ""} aria-pressed={!pair} onClick={() => setPair(false)}>Todos os válidos</button>
      </div>
    </div>
    <p className="ks-denominator">{pair
      ? "Mesma base nos dois turnos: participação na soma dos votos de Lula + Flávio."
      : "Base de cada turno: todos os votos válidos. O primeiro turno também inclui os demais candidatos."}</p>
    <div className="ks-grid">
      {FOCUS_STATES.map(({ uf, name }) => {
        const scope = snapshot?.states.find((state) => state.code === uf);
        const baseline = firstRound?.states?.find((state) => state.uf === uf);
        const otherPercent = known(baseline?.otherPercent) ? baseline.otherPercent : share(baseline?.otherVotes, baseline?.validVotes);
        const updated = scope?.sourceUpdatedAt ? new Date(scope.sourceUpdatedAt).toLocaleTimeString("pt-BR", {
          timeZone: "America/Belem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
        }) : null;
        return <article className="ks-card" key={uf} aria-label={`${name}: primeiro e segundo turnos de 2026`}>
          <button type="button" className="ks-card-heading" onClick={() => onSelect(uf)} aria-label={`Abrir apuração de ${name}`}>
            <span className="ks-uf">{uf}</span><span className="ks-name">{name}</span><ArrowUpRight size={17} aria-hidden="true"/>
          </button>
          <div className="ks-columns" aria-hidden="true"><span>CANDIDATO</span><span>1º TURNO</span><span>HOJE · 2º TURNO</span></div>
          {(["lula", "bolsonaro"] as const).map((person) => {
            const before = baselineShare(baseline, person, pair);
            const now = currentShare(scope, person, pair);
            return <div className={`ks-candidate ks-${person} color-${person}`} key={person}>
              <span className="ks-candidate-name">{person === "lula" ? "Lula" : <>Flávio<br/>Bolsonaro</>}</span>
              <strong className="ks-before"><span className="ks-sr-only">Primeiro turno: </span>{percent(before)}</strong>
              <span className="ks-now"><strong><span className="ks-sr-only">Segundo turno: </span>{percent(now)}</strong><Difference before={before} now={now}/></span>
            </div>;
          })}
          <div className="ks-other"><span>Outros no 1º turno · todos os válidos</span><strong>{percent(otherPercent)}</strong></div>
          <div className="ks-progress"><span>Seções apuradas <b>{percent(known(scope?.sectionsPercent) ? scope.sectionsPercent : null)}</b></span><i><span style={{ width: `${scope?.sectionsPercent ?? 0}%` }}/></i></div>
          <div className="ks-pending"><span>Eleitores pendentes</span><strong title={count(scope?.pendingElectorate)}>{compact(scope?.pendingElectorate)}</strong></div>
          <div className="ks-card-footer"><span>{scope?.stale ? "Leitura anterior" : scope?.status === "finished" ? "Totalização concluída" : scope?.validVotes ? "Parcial do TSE" : "Aguardando votos"}{updated ? ` · ${updated}` : ""}</span><button type="button" onClick={() => onSelect(uf)}>Abrir estado <ArrowUpRight size={12} aria-hidden="true"/></button></div>
        </article>;
      })}
    </div>
    <p className="ks-method-note">{pair
      ? "A comparação entre a dupla normaliza o denominador; não mede transferências individuais de voto."
      : "A diferença em pontos percentuais inclui a transferência dos votos de outros candidatos e mudanças de comparecimento; não representa um swing direto."} {firstRound ? "Fonte do primeiro turno: TSE · eleição 6257." : "Consultando a referência oficial do primeiro turno."}</p>
  </section>;
}

export default KeyStates;
