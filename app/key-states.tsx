"use client";

import { ArrowUpRight } from "lucide-react";
import type { Snapshot } from "../lib/ui-types";
import "./key-states.css";

type Props = {
  snapshot: Snapshot | null;
  onSelect: (uf: string) => void;
};

const FOCUS_STATES = [
  { uf: "SP", name: "São Paulo" },
  { uf: "MG", name: "Minas Gerais" },
  { uf: "BA", name: "Bahia" },
] as const;

const known = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const percent = (value: number | null | undefined) => !known(value) ? "—" : value.toLocaleString("pt-BR", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
}) + "%";
const count = (value: number | null | undefined) => !known(value) ? "—" : value.toLocaleString("pt-BR");
const compact = (value: number | null | undefined) => !known(value) ? "—" : value >= 1_000_000
  ? (value / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi" : count(value);

export function KeyStates({ snapshot, onSelect }: Props) {
  return <section className="key-states" aria-labelledby="key-states-title">
    <div className="ks-section-heading">
      <div><span className="ks-eyebrow">SP · MG · BA</span><h2 id="key-states-title">Estados em foco</h2><p>A apuração atual em São Paulo, Minas Gerais e Bahia.</p></div>
    </div>
    <div className="ks-grid">
      {FOCUS_STATES.map(({ uf, name }) => {
        const scope = snapshot?.states.find((state) => state.code === uf);
        const hasVotes = known(scope?.validVotes) && scope.validVotes > 0;
        const updated = scope?.sourceUpdatedAt ? new Date(scope.sourceUpdatedAt).toLocaleTimeString("pt-BR", {
          timeZone: "America/Belem", hour: "2-digit", minute: "2-digit", second: "2-digit",
        }) : null;
        return <article className="ks-card" key={uf} aria-label={"Apuração atual de " + name}>
          <button type="button" className="ks-card-heading" onClick={() => onSelect(uf)} aria-label={"Abrir apuração de " + name}>
            <span className="ks-uf">{uf}</span><span className="ks-name">{name}</span><ArrowUpRight size={17} aria-hidden="true"/>
          </button>
          {(["lula", "bolsonaro"] as const).map((person) => {
            const votes = person === "lula" ? scope?.lulaVotes : scope?.bolsonaroVotes;
            const share = hasVotes ? person === "lula" ? scope?.lulaPercent : scope?.bolsonaroPercent : null;
            return <div className={"ks-candidate ks-" + person} key={person}>
              <span className="ks-candidate-name">{person === "lula" ? "Lula" : "Flávio Bolsonaro"}</span>
              <span className="ks-voting"><strong>{percent(share)}</strong><small>{count(votes)} votos oficiais</small></span>
            </div>;
          })}
          <div className="ks-progress"><span>Seções apuradas <b>{percent(scope?.sectionsPercent)}</b></span><i><span style={{ width: String(scope?.sectionsPercent ?? 0) + "%" }}/></i></div>
          <div className="ks-pending"><span>Eleitores pendentes</span><strong title={count(scope?.pendingElectorate)}>{compact(scope?.pendingElectorate)}</strong></div>
          <div className="ks-source"><span>{scope?.stale ? "Leitura anterior" : scope?.status === "finished" ? "Totalização concluída" : hasVotes ? "Parcial oficial" : "Aguardando votos"}</span><span>TSE · {updated || "sem leitura"}</span></div>
          <button type="button" className="ks-open" onClick={() => onSelect(uf)}>Abrir estado <ArrowUpRight size={13} aria-hidden="true"/></button>
        </article>;
      })}
    </div>
  </section>;
}

export default KeyStates;
