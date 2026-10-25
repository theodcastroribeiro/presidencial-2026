---
title: Histórico presidencial de 2022
updated_at: 2026-10-25
timezone: America/Belem
status: implemented
tags: [eleicoes, historico, metodologia]
---

# Histórico de 2022 e leitura das projeções

Atualizado em **2026-10-25**, fuso **America/Belem**.

Convenção visual: **Lula vermelho** (`#ff655f`) e **Bolsonaro amarelo** (`#f3d34a`) nas séries de 2022 e 2026, nas referências do primeiro turno e nos recortes territoriais. As cores identificam os candidatos; contagens, percentuais, denominadores e identidade de Jair/Flávio permanecem vinculados às respectivas fontes.

## Fontes importadas

A curva nacional vem do [histórico de totalização presidencial do segundo turno de 2022 publicado pelo TSE](https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/Historico_Totalizacao_Presidente_BR_2T_2022.zip). O CSV contém **5.286 eventos observados**, de **2022-10-30 17:00:51-03:00** até **2022-10-31 00:18:04-03:00**. Nenhum ponto foi inventado ou interpolado. O intervalo entre registros varia. O primeiro registro tem 55 seções processadas; a curva não deve receber um início artificial de 0% de votos para ambos.

O resultado final por UF, incluindo Exterior (`ZZ`), vem de dois conjuntos oficiais: [votação nominal por município e zona](https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2022.zip) e [detalhe da votação por município e zona](https://cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_2022.zip). Foram selecionados `NR_TURNO=2` e `CD_CARGO=1`. Os votos são somados por `SG_UF` e `NR_CANDIDATO`, usando `QT_VOTOS_NOMINAIS_VALIDOS`. O detalhe fornece aptos, comparecimento, brancos, nulos e seções principais. A edição baixada desses arquivos foi gerada pelo TSE em **2026-10-24**; isso não muda o ano eleitoral de referência, **2022**.

Não foi localizada uma série estadual oficial equivalente à nacional. Por isso, as curvas estaduais usam o [arquivo público de snapshots de Wesley Cota](https://github.com/wcota/br_eleicoes_2022_2T), commit fixo `f2a869e104fa5a2e3fdcdb594a9ad66326db2605`, publicado em 2022-11-02. São snapshots efetivamente coletados do Divulga TSE, arquivados por um terceiro. Cada UF registra sua URL, checksum e essa natureza da fonte. Os votos finais das **27 UFs** foram conferidos contra o baseline oficial, sem divergência. Exterior tem baseline final oficial, mas não recebe curva estadual. As linhas sem votos foram excluídas: elas não representam uma participação observada de 0% dos candidatos.

Os JSON incluem checksums SHA-256 dos CSV de origem e data de importação. Os CSV e ZIP baixados são insumos temporários; os artefatos públicos contêm apenas os dados eleitorais agregados necessários ao painel.

## Contrato dos arquivos

- [`public/data/historico-2022.json`](../public/data/historico-2022.json): `{schemaVersion,election,source,totals,final,pointFields,points,coverage}`. Fonte oficial nacional.
- [`public/data/baseline-2022.json`](../public/data/baseline-2022.json): `{schemaVersion,election,source,totals,states,notes}`. Cada estado contém `uf,lulaVotes,bolsonaroVotes,validVotes,electorate,voters,blankVotes,nullVotes,sections,lulaPercent,bolsonaroPercent,turnoutPercent`.
- [`public/data/historico-2022-uf.json`](../public/data/historico-2022-uf.json): `{schemaVersion,election,pointFields,scopes,notes}`. Cada entrada de `scopes`, como `PA`, contém `{source,totals,points,coverage}`.
- [`public/data/historico-2022-regioes.json`](../public/data/historico-2022-regioes.json): `{schemaVersion,election,pointFields,scopes,notes}`. Entradas `norte`, `nordeste`, `centro-oeste`, `sudeste` e `sul`, cada uma com `{name,source,totals,final,points,coverage}`. É composição derivada do painel.

As curvas nacional e estadual usam arrays compactos com o mesmo `pointFields`:

```text
[at, sectionsPercent, electoratePercent, lulaPercent, bolsonaroPercent,
 lulaVotes, bolsonaroVotes, electorateProcessed, sections]
```

`at` é ISO 8601 com offset `-03:00`. Na série nacional é o horário do evento de totalização; no arquivo estadual é o horário da coleta arquivada, com diferença potencial de segundos para o evento original. Os dados de 2022 não usam horário do computador do visitante.

Percentuais dos JSON estão na escala **0 a 100**, com cinco casas decimais, calculados dos contadores inteiros. No CSV oficial nacional, os campos `PE_*` usam frações **0 a 1**, arredondadas a seis casas; não devem ser apresentados diretamente como percentuais. Os percentuais derivados dos contadores podem diferir dos campos arredondados originais nas últimas casas. Para exibição com duas casas, usar os percentuais oficiais da eleição atual quando disponíveis; manter os contadores para cálculos.

`electorate` é o total de aptos; `voters` é comparecimento; `electorateProcessed` é o eleitorado pertencente às seções já processadas. Eleitorado pendente **não** é número de votos ainda por entrar: contém abstenções e votos brancos/nulos ainda desconhecidos. Votos válidos são o denominador dos percentuais dos candidatos.

`sections` dentro de cada ponto de curva é o número **processado/acumulado**, não seu denominador. `totals.sections` do escopo é o total usado como denominador.

`sections` no baseline soma `QT_SECOES_PRINCIPAIS`, total **472.075**. `QT_TOTAL_SECOES` soma **496.238**, pois também inclui seções agregadas, e não serve como denominador para reproduzir a curva de totalização deste conjunto.

O total oficial conciliado é **156.454.011 aptos**, **124.252.796 votantes**, **118.552.353 votos válidos**, **60.345.999 para Lula** e **58.206.354 para Jair Bolsonaro**. Os votos brancos (**1.769.678**) e nulos (**3.930.765**) completam o comparecimento. Exterior é uma categoria separada e não integra as cinco regiões do Brasil. “Centro” não é uma sexta macrorregião oficial; a região é Centro-Oeste.

## Comparação que a curva permite

O eixo principal deve ser **percentual de seções totalizadas**, comparando o mesmo avanço em 2022 e na eleição atual. Comparar somente o relógio confunde velocidade de transmissão com comportamento do voto. O percentual do eleitorado já processado é um segundo eixo útil para reduzir o efeito de seções de tamanhos diferentes, desde que seja o mesmo denominador em ambas as séries.

Para o indicador “à frente/atrás de 2022”, selecionar o último ponto histórico observado cujo avanço seja menor ou igual ao atual e informar o avanço efetivo desse ponto. O desenho entre observações pode conectá-las visualmente, mas não transforma a linha em observações adicionais. Uma leitura interpolada precisa ser identificada como aproximação, nunca como novo evento oficial. Só habilitar a comparação depois do primeiro ponto histórico disponível.

A diferença exibida deve estar em **pontos percentuais**: participação atual menos participação histórica. Uma curva semelhante não estabelece o resultado final. A ordem geográfica da apuração muda entre pleitos e as seções apuradas não são uma amostra aleatória do país. A apuração nacional, isoladamente, pode mudar apenas porque uma região avançou mais que outra.

A série de 2022 compara **Lula e Jair Bolsonaro**. Se o candidato atual do PL tiver outro nome, mostrar esse nome atual e identificar expressamente a comparação com Jair Bolsonaro em 2022. O baseline eleitoral de um candidato anterior não transforma os dois em uma mesma candidatura.

### Composição regional de 2022

O arquivo regional contém **3.646 pontos derivados** do painel a partir das curvas estaduais arquivadas. É uma **reconstrução descritiva**, identificada como `source.kind=panel_composition` e `official=false`; não é série regional oficial publicada pelo TSE. O rótulo da interface deve conservar essa distinção.

O algoritmo reúne os horários de coleta estaduais em ordem cronológica. Em cada corte `t`, incorpora juntas todas as observações daquele horário e conserva a última observação de cada UF com horário **menor ou igual a `t`**. Isso é retenção da última observação conhecida (*forward-fill descritivo*), sem interpolação de votos e sem usar valores futuros. A região começa somente depois de todas as UFs terem ao menos uma observação com votos válidos. Os cortes anteriores com cobertura incompleta são descartados e contabilizados. Não se presume zero para UF ausente.

Os votos de Lula/Jair, o eleitorado processado e as seções processadas são somados dos snapshots retidos. `sectionsPercent` divide a soma processada pelo total oficial das UFs da região; `electoratePercent` usa a soma de aptos do baseline oficial; os percentuais dos candidatos dividem votos somados por válidos somados. Nenhuma média simples de percentuais estaduais é usada. Os totais finais de candidatos e seções conferem com a soma oficial das UFs. O eleitorado processado final do arquivo pode conservar pequena diferença em relação ao total oficial, como no Norte (**99,99933%**), e não é forçado artificialmente a 100%.

O `pointFields` regional preserva os nove campos das demais curvas e acrescenta:

```text
[...campos existentes, oldestSourceAt, latestSourceAt, forwardFilledStates]
```

`oldestSourceAt` e `latestSourceAt` expõem os horários de coleta mais antigo e mais recente efetivamente usados no ponto; `latestSourceAt` coincide com `at`, o corte da composição. `forwardFilledStates` conta quantas UFs usam uma observação anterior ao corte. A cobertura informa UFs esperadas, primeiro/último corte, cortes descartados e maior diferença temporal entre fontes. Uma UF já concluída pode manter seu último snapshot por horas enquanto outra termina; essa defasagem é preservada, e não significa que votos foram interpolados.

| Região | Pontos derivados | Primeiro corte com todas as UFs |
| --- | ---: | --- |
| Norte | 1.032 | 2022-10-30 17:17:46-03:00 |
| Nordeste | 1.069 | 2022-10-30 17:23:52-03:00 |
| Centro-Oeste | 523 | 2022-10-30 17:08:38-03:00 |
| Sudeste | 563 | 2022-10-30 17:14:22-03:00 |
| Sul | 459 | 2022-10-30 17:17:45-03:00 |

Esses cortes não são observações simultâneas de todas as urnas da região. A curva oferece uma referência regional aproximada por avanço, sujeita à cadência do arquivo de terceiro. Não apresentá-la como uma nova observação oficial. Os totais regionais atuais também podem somar UFs de horários distintos e precisam conservar essa informação. Exterior não integra nenhuma região.

## Referência oficial do primeiro turno de 2026

O arquivo [`public/data/first-round-2026.json`](../public/data/first-round-2026.json) contém o resultado presidencial final de **2026-10-04**, eleição **6257**. A identidade foi conferida na [configuração oficial de eleições do TSE](https://resultados.tse.jus.br/oficial/comum/config/ele-c.json): eleição federal, turno 1, cargo presidente e segundo turno relacionado **6258**. Não usar a eleição estadual 6259 como origem presidencial.

São **29 arquivos oficiais**: Brasil, 27 UFs e Exterior. O [arquivo nacional](https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json) informa **119.300.788 votos válidos**, dos quais **53.879.538 para Lula**, **56.104.503 para Flávio Bolsonaro** e **9.316.747 para os demais candidatos**. Todas as UFs foram conciliadas com o total nacional em votos, eleitorado, comparecimento, brancos, nulos e seções. Cada recorte preserva URL, checksum, horário de geração e horário de totalização oficiais. As regiões são somas do painel e têm sua natureza derivada identificada.

Contrato: `{schemaVersion,election,source,national,states,regions,percentBases,history,notes,validation}`. Cada elemento de `states` tem `uf`, contadores inteiros de votos/aptos/seções, `source`, datas oficiais e os seguintes percentuais, todos na escala **0 a 100**:

| Campo | Denominador | Uso |
| --- | --- | --- |
| `lulaPercent`, `bolsonaroPercent`, `otherPercent` | Todos os votos válidos do primeiro turno | Resultado efetivamente observado do primeiro turno |
| `pairLulaPercent`, `pairBolsonaroPercent` | Somente votos de Lula + Flávio | Comparação contextual normalizada entre os finalistas |
| `turnoutPercent` | Eleitorado apto | Comparecimento |
| `validYieldPercent` | Eleitorado apto | Votos válidos por eleitor apto |

No Brasil, os percentuais sobre todos os válidos são **45,16276791% para Lula** e **47,02777236% para Flávio**. Excluindo matematicamente os votos dos demais candidatos, a dupla normalizada fica **48,98850552% para Lula** e **51,01149448% para Flávio**. A dupla normalizada não é resultado observado do segundo turno e não presume que os 9,3 milhões de votos dos outros candidatos migrarão nessa proporção. Mudanças de comparecimento, brancos e nulos também afetam a comparação. A UI deve apresentar o denominador escolhido e distinguir as duas leituras.

Não foi localizado um arquivo de snapshots temporais do primeiro turno de 2026 nas URLs oficiais consultadas. [`public/data/historico-2026-1t.json`](../public/data/historico-2026-1t.json) registra `available=false`, `pointFields=[]`, `scopes={}`, motivo, data da consulta e resultados HTTP das fontes. Isso registra o resultado da busca, sem afirmar inexistência de toda e qualquer série. **Nenhuma curva foi criada a partir do resultado final**, nem reconstruída com contagens finais por seção associadas a horários de totalização. A referência do primeiro turno, neste painel, é um **benchmark final identificado**, e a referência temporal permanece a curva observada de 2022.

Importador reproduzível: [`scripts/import-first-round.py`](../scripts/import-first-round.py). Executar `python3 scripts/import-first-round.py`. O script valida eleição/cargo/turno, identidades Lula/Flávio, destinação válida, totalização final, soma dos candidatos, comparação dos 28 recortes com BR, denominadores e decomposição dos votos; grava o baseline e o manifesto temporal. Ele não incorpora um arquivo de histórico que eventualmente apareça depois sem inspeção e validação do seu esquema.

## Projeção sugerida e limites

Uma projeção útil soma os votos já conhecidos a uma estimativa dos votos pendentes **por UF**, incluindo `ZZ` à parte. Para a UF `u`, uma estimativa transparente de votos válidos pendentes é:

```text
R_u = max(0, aptos_u - aptos_processados_u)
      × (comparecimento_2022_u / aptos_2022_u)
      × (validos_2022_u / comparecimento_2022_u)
```

Essa conta assume comparecimento e proporção de válidos remanescentes próximos aos de 2022. Se o eleitorado processado estiver ausente, ele não deve ser substituído silenciosamente por zero. Estimar a cobertura pelo percentual de seções exige rotular a aproximação, pois as seções têm tamanhos diferentes. A leitura deve preferir percentuais atuais de comparecimento quando forem estáveis e usar o histórico para o que ainda não foi observado.

A divisão dos votos pendentes pode usar o desempenho atual da própria UF, suavizado no começo pelo baseline. Uma alternativa melhor quando a curva estadual está disponível usa a participação histórica **dos votos que ainda faltavam em 2022** naquele ponto, ajustada pela diferença entre a participação atual e a participação histórica já observada. Em ambos os casos, aplicar o modelo apenas ao saldo pendente: os votos já apurados são fixos e nunca reestimados.

São necessários limites claros: pouca cobertura, ausência de UF/Exterior, mudança do eleitorado, ordem municipal de transmissão e a transferência de votos entre candidaturas de eleições diferentes podem alterar a estimativa. Não declarar probabilidade de vitória, margem de erro estatística ou intervalo de confiança sem validação retrospectiva. Uma faixa produzida ao variar a participação nos votos pendentes é um **cenário de sensibilidade**, com hipótese explícita, e não confiança estatística.

## Reprodução e validações executadas

Importador: [`scripts/import-history.py`](../scripts/import-history.py).

```sh
python3 scripts/import-history.py \
  --history-csv /caminho/Historico_Totalizacao_Presidente_BR_2T_2022.csv \
  --votes-csv /caminho/votacao_candidato_munzona_2022_BR.csv \
  --details-zip /caminho/detalhe_votacao_munzona_2022.zip \
  --with-uf-archive
```

Sem argumentos, o importador baixa apenas a curva nacional oficial. O ZIP de votação nominal completo é grande: para reproduzir o baseline, extrair somente seu membro `votacao_candidato_munzona_2022_BR.csv`, sem concatenar arquivos de UF e BR, pois isso duplicaria votos. A opção estadual fixa o commit de origem, confere o resultado final de cada estado e gera também a composição regional. Para derivar somente as regiões dos JSON existentes, sem nova coleta, executar `python3 scripts/import-history.py --regions-from-existing`.

Em 2026-10-25 foram executadas as seguintes verificações: 5.286 eventos nacionais preservados; datas em ordem e seções acumuladas não decrescentes; soma dos candidatos igual aos votos concorrentes em cada evento; seleção de 12.566 linhas nominais e 6.283 linhas do detalhe; ausência de chave municipal/zona duplicada no detalhe; conciliação de votos por UF e nacional; conciliação de comparecimento com válidos, brancos e nulos; coincidência dos totais do baseline com o último evento nacional; coincidência dos finais dos 27 arquivos estaduais com o resultado oficial. Também foram verificados os 3.646 pontos compostos regionais por recomposição independente: última observação anterior ou igual ao corte para cada UF, nenhum uso de futuro, cobertura completa em todos os pontos, soma exata de contadores, horários mínimo/máximo preservados e finais regionais iguais ao baseline oficial. Não foi feito backtest de qualidade preditiva, portanto a projeção deve conservar esse limite.


## Cenário territorial do primeiro turno

A referência de 2026 não é descartada ao superar 10% de apuração. O deslocamento compartilhado é a diferença entre a participação atual de Lula e a participação do primeiro turno esperada **nas mesmas UFs, ponderadas pelos mesmos votos válidos já contados**. O deslocamento global é suavizado pelo avanço nacional até 10%. Em cada UF, a participação dos votos pendentes é a participação da dupla no primeiro turno acrescida de `(1-q) × deslocamentoGlobal + q × deslocamentoLocal`, com `q` igual ao avanço do eleitorado processado da UF e limites de 0% a 100%. Isso é uma hipótese territorial compartilhada; não mede transferências individuais. O rendimento de votos válidos mantém mistura de rendimento final de referência com rendimento atual, com apoio inicial até 10%. Ao zerar a pendência, os votos observados prevalecem integralmente.

O cenário combinado calcula a média dos votos projetados com pesos 50/50. Sua proporção residual por UF é ponderada pelo número de votos pendentes de cada referência; a sensibilidade é aplicada a esse resíduo combinado e limitada dentro de cada UF. Não foi demonstrado ganho de acurácia por backtest.


## Interface simplificada em 2026-10-25

A pedido do usuário, a interface deixou de exibir referências ao primeiro turno e ao cenário combinado. Os arquivos importados e módulos anteriores permanecem no projeto como histórico técnico. SP/MG/BA ficam no fim da página, com dados atuais do TSE.
