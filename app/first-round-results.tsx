import { CheckCircle2, ExternalLink, FileText } from "lucide-react";
import type { OfficialFirstRoundResult } from "../lib/first-round-results";
import "./first-round-results.css";

type Props = { result: OfficialFirstRoundResult | null };
const count = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value)
  ? value.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—";
const percent = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value)
  ? value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%" : "—";
const sourceTime = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Belem", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value)) : "horário não informado";

function originalPercent(value: string | null | undefined) {
  const original = value?.trim().replace(/%$/, "").trim();
  return original && /^\d+(?:[.,]\d+)?$/.test(original) ? percent(Number(original.replace(",", "."))) : "—";
}

export function FirstRoundResults({ result }: Props) {
  const verifiedFinal = !!result && result.final && result.complete && result.coverage.complete && typeof result.sections === "number" && result.sections > 0
    && result.sectionsProcessed === result.sections && result.sectionsPercent === 100;
  const candidates = verifiedFinal ? [...result.candidates].sort((a, b) => Number(a.number) - Number(b.number)) : [];
  const sources = result?.sources || [];
  const aggregated = !!result?.aggregation;
  return <section className="first-round-results" id="primeiro-turno" aria-labelledby="first-round-results-title">
    <div className="fr-heading"><div><span className="fr-eyebrow">REGISTRO DA ELEIÇÃO</span><h2 id="first-round-results-title">Resultado oficial · 1º turno · 2026</h2><p>{result?.name || "Recorte selecionado"}{aggregated ? " · soma dos resultados oficiais das UFs" : " · dados publicados pelo TSE"}</p></div><span className="fr-source-badge"><FileText size={13} aria-hidden="true"/>{aggregated ? "AGREGADO DE FONTES TSE" : "FONTE TSE"}</span></div>
    {!verifiedFinal ? <div className="fr-unavailable" role="status">O resultado final validado do primeiro turno não está disponível para este recorte.</div> : <>
      <div className="fr-status"><CheckCircle2 size={15} aria-hidden="true"/><span>Totalização concluída · {percent(result.sectionsPercent)} das seções verificadas</span><small>{count(result.sectionsProcessed)} de {count(result.sections)} seções</small></div>
      <div className="fr-summary"><div><span>ELEITORADO DO RECORTE</span><strong>{count(result.electorate)}</strong></div><div><span>VOTOS VÁLIDOS</span><strong>{count(result.validVotes)}</strong></div><div><span>CANDIDATURAS</span><strong>{count(candidates.length)}</strong></div></div>
      <p className="fr-denominator">{result.denominatorLabel || "Percentuais sobre todos os votos válidos do recorte."} {aggregated ? "Votos somados das UFs; percentuais calculados sobre o total de votos válidos dessa soma." : "Percentuais individuais conforme a publicação do TSE, exibidos com duas casas decimais."}</p>
      <div className="fr-candidates"><table><caption className="fr-sr-only">Votos e percentuais individuais do primeiro turno em {result.name}, em ordem crescente do número da candidatura.</caption><thead><tr><th scope="col">NÚMERO</th><th scope="col">CANDIDATURA / PARTIDO</th><th scope="col">VOTOS</th><th scope="col">% DOS VÁLIDOS</th></tr></thead><tbody>{candidates.map((candidate) => <tr key={candidate.number}><td><span className="fr-candidate-number">{candidate.number}</span></td><th scope="row"><span className="fr-candidate-name" title={candidate.fullName}>{candidate.name}</span><small>{candidate.party}</small></th><td className="fr-votes">{count(candidate.votes)}</td><td className="fr-percent" data-candidate={candidate.number}>{aggregated ? percent(candidate.percent) : originalPercent(candidate.publishedPercent ?? candidate.publishedPercentExact)}</td></tr>)}</tbody></table></div>
      <p className="fr-order-note">Candidaturas em ordem crescente do número registrado.</p>
    </>}
    {!!result?.warnings.length && <div className="fr-warnings"><b>Avisos da fonte</b><ul>{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
    {result && <div className="fr-source"><div><span>{aggregated ? "Agregado do painel" : "Tribunal Superior Eleitoral"}</span><p>{aggregated ? <>Fontes geradas de {sourceTime(result.sourceRange?.earliest)} a {sourceTime(result.sourceRange?.latest)}</> : <>Geração da fonte: {sourceTime(result.sourceUpdatedAt)}</>} · Belém</p><p>Fontes consultadas em {sourceTime(result.sourceFetchedAt)} · Belém</p></div>{result.sourceUrl && <a href={result.sourceUrl} target="_blank" rel="noreferrer">Abrir fonte TSE <ExternalLink size={13} aria-hidden="true"/></a>}</div>}
    {result && <div className="fr-coverage">Cobertura: {count(result.coverage.available)} de {count(result.coverage.expected)} {aggregated ? "UFs" : "recortes da fonte"} disponíveis.{result.coverage.missing.length ? " Ausentes: " + result.coverage.missing.join(", ") + "." : ""}{aggregated && " Cada UF possui seu próprio horário de geração."}</div>}
    {!!sources.length && <details className="fr-source-details"><summary>Consultar {sources.length} fontes oficiais{aggregated ? " das UFs" : " do recorte"}</summary><div>{sources.map((source) => <a key={source.code} href={source.url} target="_blank" rel="noreferrer"><span>{source.code === "ZZ" ? "Exterior" : source.code === "BR" ? "Brasil" : source.code}<ExternalLink size={11} aria-hidden="true"/></span><small>{sourceTime(source.generatedAt)} · Belém</small></a>)}</div></details>}
  </section>;
}
