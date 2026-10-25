/** Residual-reference scenarios. These are transparent hypotheses, not validated forecasts. */
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const pct = (part, total) => total > 0 ? part / total * 100 : null;
const safeCount = value => Number.isSafeInteger(value) && value >= 0;
const NUMERIC_FIELDS = ["lulaPercent", "bolsonaroPercent", "lulaVotes", "bolsonaroVotes", "validVotes", "pendingValidVotes", "lowLulaPercent", "highLulaPercent", "lowBolsonaroPercent", "highBolsonaroPercent"];
const REFERENCE_LABELS = { historical2022: "Curva de 2022", firstRound2026: "1º turno de 2026", combined: "Combinado · 50/50" };

function referenceRowValid(row) {
  return row && safeCount(row.electorate) && row.electorate > 0 && [row.validVotes, row.lulaVotes, row.bolsonaroVotes].every(safeCount)
    && row.validVotes <= row.electorate && row.lulaVotes + row.bolsonaroVotes <= row.validVotes && row.lulaVotes + row.bolsonaroVotes > 0;
}
function emptyModel(id, options, states) {
  const expected = options.expectedStates ?? 28;
  const total = options.totalElectorate || (states.length === expected ? states.reduce((sum, state) => sum + state.electorate, 0) : null);
  const fresh = states.filter(state => !state.stale && state.official && !state.warnings?.length && state.electorate > 0);
  const excludedStates = states.filter(state => !fresh.includes(state)).map(state => state.code);
  const coveragePercent = total ? fresh.reduce((sum, state) => sum + state.electorate, 0) / total * 100 : null;
  const incomplete = fresh.length !== expected || new Set(fresh.map(state => state.code)).size !== expected || excludedStates.length > 0 || coveragePercent === null || coveragePercent < 99.999;
  const unreliableNational = (options.requireNational && !options.national) || options.national?.stale || options.national?.warnings?.length;
  const blocked = incomplete || unreliableNational || (options.gateProjection && options.gateProjection.status === "limited");
  const model = { id, label: REFERENCE_LABELS[id], method: "Resíduo de referência por UF", available: false, status: blocked ? "limited" : "waiting",
    scenarioSwingPp: options.scenarioSwingPp ?? 3, statesWithVotes: fresh.filter(state => state.validVotes > 0).length,
    statesIncluded: fresh.length, statesExpected: expected, coveragePercent,
    countedElectoratePercent: total ? fresh.reduce((sum, state) => sum + state.electorateProcessed, 0) / total * 100 : null,
    excludedStates, baselineStates: 0, states: [], referenceWeights: [{ id, weight: 1 }],
    temporal: { matchedStates: 0, baselineOnlyStates: 0, gappedStates: [], maxLagPp: null, maxAcceptedLagPp: options.maxReferenceLagPp ?? 5 },
    suspensionReason: blocked ? "Cenário suspenso: exige BR confiável e cobertura fresca de todas as UFs e do exterior." : "Aguardando os primeiros votos válidos.",
    assumptions: ["Cenário próprio sem precisão validada ou probabilidade de vitória.", "A referência usa a última observação histórica no mesmo avanço ou anterior, medido pelo eleitorado totalizado; a distância entre observações fica explícita.", "Uma lacuna superior a 5 pontos percentuais usa o resultado final de referência como apoio, sem inventar uma curva no intervalo.", "Deslocamentos observados são reduzidos no começo: peso mínimo(1, avanço do eleitorado/10%). Não há ganho tardio fixo de qualquer candidato.", "A faixa altera a participação de Lula somente nos votos pendentes; é sensibilidade, não intervalo estatístico."],
  };
  for (const field of NUMERIC_FIELDS) model[field] = null;
  return { model, blocked, fresh };
}

/** Return the last real archived observation at/before the requested electorate progress. */
export function referencePointAt(history, code, progress, final, round) {
  const scope = history?.scopes?.[code];
  if (!scope?.points?.length) return null;
  const fields = history.pointFields || ["at", "sectionsPercent", "electoratePercent", "lulaPercent", "bolsonaroPercent", "lulaVotes", "bolsonaroVotes", "electorateProcessed", "sections"];
  const get = (point, name) => Array.isArray(point) ? point[fields.indexOf(name)] : point[name];
  let best = null;
  for (const point of scope.points) {
    const electorateProcessed = get(point, "electorateProcessed");
    const progressPercent = safeCount(electorateProcessed) ? electorateProcessed / final.electorate * 100 : get(point, "electoratePercent");
    const lulaVotes = get(point, "lulaVotes"), bolsonaroVotes = get(point, "bolsonaroVotes");
    if (!Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > progress * 100 + 1e-9 || !safeCount(lulaVotes) || !safeCount(bolsonaroVotes)
      || lulaVotes > final.lulaVotes || bolsonaroVotes > final.bolsonaroVotes) continue;
    const explicitValid = get(point, "validVotes");
    const validVotes = safeCount(explicitValid) ? explicitValid : round === 2 ? lulaVotes + bolsonaroVotes : null;
    if (validVotes !== null && (validVotes > final.validVotes || validVotes < lulaVotes + bolsonaroVotes)) continue;
    const at = get(point, "at");
    if (!best || progressPercent > best.progressPercent || (progressPercent === best.progressPercent && Date.parse(at) >= Date.parse(best.at))) best = { at, progressPercent, electorateProcessed: safeCount(electorateProcessed) ? electorateProcessed : progressPercent / 100 * final.electorate, lulaVotes, bolsonaroVotes, validVotes };
  }
  return best;
}

export function projectFromReference(states, reference, options = {}) {
  const id = reference.id;
  const { model, blocked, fresh } = emptyModel(id, options, states);
  model.referenceYear = reference.year;
  model.referenceRound = reference.round;
  model.referenceSources = { baseline: reference.baseline?.source || null, history: reference.history ? { kind: "third_party_archive", publisher: "Wesley Cota", originalPublisher: "TSE", note: "Observações arquivadas por UF; identificação de fonte preservada em historico-2022-uf.json." } : null };
  const isFirstRound = reference.round === 1;
  model.otherVoteAssumption = isFirstRound ? "A proporção de Lula e Flávio é normalizada apenas entre os dois candidatos do 1º turno. Aplicá-la aos votos válidos pendentes é hipótese proporcional de cenário; votos de outros candidatos não têm transferência observada nem são somados a um candidato. O rendimento usa todos os votos válidos do 1º turno." : "2022 compara Lula com Jair Bolsonaro; 2026 compara Lula com Flávio Bolsonaro. Similaridade histórica é hipótese de cenário.";
  if (isFirstRound && !reference.history) model.assumptions.push("Não foi encontrada série temporal do 1º turno de 2026. Este cenário usa somente resultados finais por UF e deslocamento observado; não corrige o viés temporal dentro da UF.");
  if (blocked || !model.statesWithVotes) return model;
  const map = new Map((reference.baseline?.states || []).filter(referenceRowValid).map(row => [row.uf || row.code, row]));
  const usesTerritorialSwing = isFirstRound && !reference.history;
  const observedVotes = fresh.reduce((sum, state) => sum + state.validVotes, 0);
  const observedLulaVotes = fresh.reduce((sum, state) => sum + state.lulaVotes, 0);
  const baselineInObservedSample = fresh.reduce((sum, state) => {
    const final = map.get(state.code);
    return sum + (final ? state.validVotes * final.lulaVotes / (final.lulaVotes + final.bolsonaroVotes) : 0);
  }, 0);
  const nationalProgress = fresh.reduce((sum, state) => sum + state.electorateProcessed, 0) / fresh.reduce((sum, state) => sum + state.electorate, 0);
  const sharedSwing = observedVotes > 0 ? (observedLulaVotes - baselineInObservedSample) / observedVotes * clamp(nationalProgress / 0.1) : 0;
  if (usesTerritorialSwing) {
    model.territorialSwingPp = sharedSwing * 100;
    model.assumptions.push("Sem curva temporal do 1º turno, o perfil territorial da dupla continua na referência: resíduo da UF = base 1T + (1−avanço UF) × deslocamento compartilhado + avanço UF × deslocamento local. O deslocamento compartilhado compara a votação atual com a referência ponderada pelos mesmos votos já observados e é suavizado até 10% de avanço nacional.", "Esse compartilhamento entre UFs é hipótese de cenário, sem validação de precisão. O rendimento de votos válidos continua combinando rendimento de referência e observado até 10% de avanço da UF; depois usa o rendimento observado.");
  }
  const details = [];
  let totalLula = 0, totalBolsonaro = 0, lowLula = 0, highLula = 0, pending = 0;
  for (const state of fresh) {
    const final = map.get(state.code);
    if (!final && state.pendingElectorate > 0) { model.excludedStates.push(state.code); continue; }
    const q = state.electorateProcessed / state.electorate;
    const weight = clamp(q / 0.1);
    const currentShare = state.validVotes > 0 ? state.lulaVotes / state.validVotes : null;
    const currentYield = state.electorateProcessed > 0 ? state.validVotes / state.electorateProcessed : null;
    const finalPair = final ? final.lulaVotes + final.bolsonaroVotes : 0;
    const finalShare = finalPair ? final.lulaVotes / finalPair : currentShare;
    const finalYield = final ? final.validVotes / final.electorate : currentYield;
    const point = final ? referencePointAt(reference.history, state.code, q, final, reference.round) : null;
    const lagPp = point ? q * 100 - point.progressPercent : null;
    const withinGap = point && lagPp <= (options.maxReferenceLagPp ?? 5);
    const historicalPair = point ? point.lulaVotes + point.bolsonaroVotes : 0;
    const residualPair = point ? finalPair - historicalPair : 0;
    let residualShare, residualYield, shiftPp = null, basis;
    if (state.pendingElectorate === 0) {
      residualShare = currentShare ?? finalShare; residualYield = 0; basis = "final-actual";
    } else if (withinGap && residualPair > 0 && historicalPair > 0) {
      const referenceObservedShare = point.lulaVotes / historicalPair;
      const referenceResidualShare = (final.lulaVotes - point.lulaVotes) / residualPair;
      shiftPp = currentShare === null ? 0 : (currentShare - referenceObservedShare) * 100;
      residualShare = clamp(referenceResidualShare + weight * (currentShare === null ? 0 : currentShare - referenceObservedShare));
      const referencePendingElectorate = final.electorate - point.electorateProcessed;
      const historicalResidualYield = point.validVotes !== null && referencePendingElectorate > 0 ? (final.validVotes - point.validVotes) / referencePendingElectorate : finalYield;
      const historicalObservedYield = point.validVotes !== null && point.electorateProcessed > 0 ? point.validVotes / point.electorateProcessed : null;
      residualYield = clamp(historicalResidualYield + (currentYield !== null && historicalObservedYield !== null ? weight * (currentYield - historicalObservedYield) : 0));
      basis = "matched-residual";
      model.temporal.matchedStates++;
      model.temporal.maxLagPp = Math.max(model.temporal.maxLagPp ?? 0, lagPp);
    } else {
      residualShare = usesTerritorialSwing
        ? clamp(finalShare + (1 - q) * sharedSwing + q * (currentShare === null ? 0 : currentShare - finalShare))
        : clamp(currentShare === null ? finalShare : finalShare * (1 - weight) + currentShare * weight);
      residualYield = clamp(currentYield === null ? finalYield : finalYield * (1 - weight) + currentYield * weight);
      basis = usesTerritorialSwing ? "territorial-shared-swing" : point && !withinGap ? "baseline-gap" : "baseline-no-curve";
      model.baselineStates++;
      model.temporal.baselineOnlyStates++;
      if (point && !withinGap) model.temporal.gappedStates.push({ code: state.code, lagPp, referenceAt: point.at });
    }
    if (!Number.isFinite(residualShare) || !Number.isFinite(residualYield)) { model.excludedStates.push(state.code); continue; }
    const remaining = state.pendingElectorate * residualYield;
    const predictedLula = state.lulaVotes + remaining * residualShare;
    const predictedBolsonaro = state.bolsonaroVotes + remaining * (1 - residualShare);
    totalLula += predictedLula; totalBolsonaro += predictedBolsonaro; pending += remaining;
    lowLula += state.lulaVotes + remaining * clamp(residualShare - model.scenarioSwingPp / 100);
    highLula += state.lulaVotes + remaining * clamp(residualShare + model.scenarioSwingPp / 100);
    details.push({ code: state.code, basis, remainingValidVotes: Math.round(remaining), lulaPercent: residualShare * 100, bolsonaroPercent: (1 - residualShare) * 100,
      residualLulaPercent: residualShare * 100, referenceProgressPercent: point?.progressPercent ?? null, currentProgressPercent: q * 100, lagPp, shiftPp,
      referenceOtherVotes: isFirstRound && final ? final.validVotes - finalPair : 0,
      referencePairLulaPercent: finalShare * 100, referenceAllValidLulaPercent: final ? pct(final.lulaVotes, final.validVotes) : null,
      referenceValidYieldPercent: finalYield * 100, projectedValidYieldPercent: residualYield * 100,
      projectedLulaVotes: predictedLula, projectedBolsonaroVotes: predictedBolsonaro, referenceAt: point?.at || null,
    });
  }
  if (details.length !== model.statesExpected || model.excludedStates.length) return { ...model, status: "limited", suspensionReason: "Falta referência utilizável para ao menos uma UF; cenário nacional suspenso." };
  const total = totalLula + totalBolsonaro;
  if (!total) return model;
  const allFinal = fresh.every(state => state.pendingElectorate === 0);
  return { ...model, available: true, status: allFinal ? "final" : "available", suspensionReason: null,
    lulaVotes: Math.round(totalLula), bolsonaroVotes: Math.round(totalBolsonaro), validVotes: Math.round(total), pendingValidVotes: Math.round(pending),
    lulaPercent: pct(totalLula, total), bolsonaroPercent: pct(totalBolsonaro, total), lowLulaPercent: pct(lowLula, total), highLulaPercent: pct(highLula, total),
    lowBolsonaroPercent: 100 - pct(highLula, total), highBolsonaroPercent: 100 - pct(lowLula, total), states: details };
}

export function combineReferenceProjections(models, states, options = {}) {
  const { model, blocked } = emptyModel("combined", options, states);
  const supplied = models.filter(Boolean);
  model.referenceWeights = supplied.map(value => ({ id: value.id, weight: 1 / supplied.length }));
  model.assumptions.push("Combinação aritmética dos votos estimados das referências disponíveis, com pesos iguais declarados. Pesos não foram ajustados por backtest nem demonstram precisão superior.");
  model.otherVoteAssumption = supplied.find(value => value.id === "firstRound2026")?.otherVoteAssumption || supplied[0]?.otherVoteAssumption || null;
  model.referenceSources = supplied.map(value => ({ id: value.id, sources: value.referenceSources }));
  model.temporal = { references: supplied.map(value => ({ id: value.id, ...value.temporal })) };
  if (blocked) return model;
  const available = models.filter(value => value?.available);
  if (!available.length) return { ...model, status: models.some(value => value?.status === "limited") ? "limited" : "waiting", suspensionReason: "Aguardando referências com cobertura completa para combinar cenários." };
  const weight = 1 / available.length;
  const average = key => available.reduce((sum, value) => sum + value[key] * weight, 0);
  const validVotes = average("validVotes");
  const lulaVotes = average("lulaVotes"), bolsonaroVotes = average("bolsonaroVotes");
  const statesDetails = states.map(state => {
    const records = available.map(value => value.states.find(item => item.code === state.code)).filter(Boolean);
    const remainingValidVotes = records.reduce((sum, item) => sum + item.remainingValidVotes * weight, 0);
    const residualLulaVotes = records.reduce((sum, item) => sum + item.remainingValidVotes * item.lulaPercent / 100 * weight, 0);
    const share = remainingValidVotes > 0 ? residualLulaVotes / remainingValidVotes : state.validVotes > 0 ? state.lulaVotes / state.validVotes : 0.5;
    return { code: state.code, remainingValidVotes, lulaPercent: share * 100, bolsonaroPercent: (1 - share) * 100, residualLulaPercent: share * 100, basis: "reference-average" };
  });
  const centralLulaPercent = pct(lulaVotes, validVotes);
  const lowDelta = statesDetails.reduce((sum, state) => sum + state.remainingValidVotes * (clamp(state.lulaPercent / 100 - model.scenarioSwingPp / 100) - state.lulaPercent / 100), 0);
  const highDelta = statesDetails.reduce((sum, state) => sum + state.remainingValidVotes * (clamp(state.lulaPercent / 100 + model.scenarioSwingPp / 100) - state.lulaPercent / 100), 0);
  const lowLulaPercent = clamp((centralLulaPercent + lowDelta / validVotes * 100) / 100) * 100;
  const highLulaPercent = clamp((centralLulaPercent + highDelta / validVotes * 100) / 100) * 100;
  return { ...model, available: true, status: available.every(value => value.status === "final") ? "final" : "available", suspensionReason: null,
    label: available.length === 2 ? REFERENCE_LABELS.combined : `Combinado · ${available[0].label}`,
    referenceWeights: available.map(value => ({ id: value.id, weight })),
    assumptions: [...model.assumptions, "A sensibilidade do combinado aplica o deslocamento ao perfil residual combinado em cada UF, ponderado pelos votos pendentes estimados; não é média das faixas dos modelos individuais."],
    otherVoteAssumption: available.find(value => value.id === "firstRound2026")?.otherVoteAssumption || available[0].otherVoteAssumption,
    referenceSources: available.map(value => ({ id: value.id, sources: value.referenceSources })),
    temporal: { references: available.map(value => ({ id: value.id, ...value.temporal })) },
    baselineStates: Math.max(...available.map(value => value.baselineStates)),
    lulaVotes: Math.round(lulaVotes), bolsonaroVotes: Math.round(bolsonaroVotes), validVotes: Math.round(validVotes), pendingValidVotes: Math.round(average("pendingValidVotes")),
    lulaPercent: centralLulaPercent, bolsonaroPercent: pct(bolsonaroVotes, validVotes), lowLulaPercent, highLulaPercent,
    lowBolsonaroPercent: 100 - highLulaPercent, highBolsonaroPercent: 100 - lowLulaPercent, states: statesDetails };
}

export function projectReferences(states, references, options = {}) {
  const historical2022 = projectFromReference(states, { id: "historical2022", year: 2022, round: 2, ...references.historical2022 }, options);
  const firstRound2026 = projectFromReference(states, { id: "firstRound2026", year: 2026, round: 1, ...references.firstRound2026 }, options);
  const combined = combineReferenceProjections([historical2022, firstRound2026], states, options);
  return { historical2022, firstRound2026, combined };
}
