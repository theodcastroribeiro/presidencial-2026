---
tags: [eleicoes, presidencial, publico, coleta, historico]
---

# Coleta autônoma da cópia pública

Atualizado em **2026-10-25**, fuso `America/Belem`. Site desta cópia: `appgprj_6ade602a5e088191a22a6a8c4f69d2df`, URL esperada [Presidencial 2026 público](https://presidencial-2026-publico.theodcastroribeiro.chatgpt.site). O Site original e seu armazenamento permanecem separados e não são atualizados por esta rotina.

## Leitura pública e escrita autorizada

`GET /api/results` consulta e normaliza somente arquivos oficiais do TSE e não grava no R2. A interface consulta a cada 60 segundos, inclusive na volta à aba. `GET /api/history` lê os snapshots já persistidos, sem criar novas observações.

`POST /api/refresh` é o único endpoint de coleta com persistência. Exige `Authorization: Bearer <segredo>` e compara o valor com a variável secreta Sites `COLLECTOR_TOKEN`. O mesmo valor novo deve estar no segredo GitHub Actions `PUBLIC_COLLECTOR_TOKEN`. Não usar token de acesso do Site privado, cookies de sessão ou credencial de publicação. Os valores ficam nos serviços de segredos; não entram no repositório, comandos com argumentos, documentação nem logs. O destino do coletor é fixo nesta cópia pública.

O endpoint força consulta ao TSE, calcula cobertura de 29 fontes — Brasil, 27 UFs e exterior —, guarda somente observações oficiais válidas e lê de volta o objeto R2 correspondente. Sua resposta informa `ok`, `fresh`, `coverage`, `persistence` e `readback`. `ok=true` exige 29 fontes frescas e confirmação de leitura do objeto persistido. Uma consulta HTTP revalidada pode trazer a mesma geração; isso é sucesso com `persistence.reason=already-recorded`, sem inventar outro ponto. Falhas de fonte ou armazenamento são separadas da parcial oficial.

Snapshots completos são gravados condicionalmente e de forma imutável por fingerprint de gerações e valores oficiais no prefixo `presidential/2026/6258/2/snapshots/v1/`. Corpo e metadados resumidos são publicados no mesmo `put`; não existe índice mutável com ciclo ler/alterar/gravar. O resumo comprimido usa teto de 7.500 bytes, abaixo do [limite oficial R2 de 8.192 bytes](https://developers.cloudflare.com/r2/platform/limits/). Estados frescos podem ser preservados numa coleta parcial, mas a execução não declara cobertura completa. Fonte anterior não entra como leitura nova.

## Agenda e rodada contínua

O workflow `.github/workflows/collect.yml` possui agenda de cinco minutos, deslocada do minuto zero, e execução manual. A opção `continuous=false` faz uma coleta com até três tentativas e esperas de dois e cinco segundos entre elas. `continuous=true` mantém uma rodada de até 330 minutos, buscando coletar a cada minuto, com timeout do job em 350 minutos. Requisições lentas não se sobrepõem dentro do processo.

Os grupos de concorrência são distintos: a agenda de cinco minutos continua funcionando durante uma rodada manual. Duas rodadas contínuas não executam simultaneamente. Sobreposição entre agenda e rodada contínua é idempotente no R2; geração inalterada não gera ponto adicional.

`scripts/collect-public.mjs` usa apenas Node.js 24 e `fetch` nativo, sem instalar dependências. O workflow usa runner Ubuntu padrão, checkout fixado por SHA e Node 24 já presente no toolcache da imagem. Não publica artefatos, não faz commits de snapshots e só possui `contents:read`. Os logs mostram resultado, cobertura, motivo de persistência e horário oficial, com redação adicional do segredo.

GitHub Actions pode atrasar ou perder disparos sob carga, exige o workflow na branch padrão e desativa agendas de repositórios públicos após 60 dias sem atividade. Cinco minutos é o menor intervalo permitido. [Fonte oficial](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule). Runners padrão em repositórios públicos têm minutos gratuitos; runners maiores seguem cobrança própria. [Cobrança oficial](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

## Histórico e recuperação

O histórico começa com a primeira observação realmente persistida em 2026-10-25, sem preencher parciais anteriores. A resposta entrega até 300 pontos existentes, podendo amostrar sem interpolar; preserva contagens exatas, geração e horários. Percentual de seções é distinto do percentual do eleitorado processado. Regiões são agregações identificadas.

Intervalo sem snapshot não prova ausência de consulta: a geração pode ter permanecido igual. A agenda e os logs demonstram execuções; o histórico demonstra mudanças oficiais observadas. Intervalos entre registros deduplicados não comprovam falha de coleta.

Se a leitura nacional falhar após recarregar a página, o GET pode recuperar snapshot anterior do R2. A resposta conserva horários originais, marca os escopos como anteriores, informa `source.live=false` e `source.preserved=true`, suspende todas as projeções e não faz nova gravação. Falha de leitura do R2 não cria base fictícia.

## Verificação e ativação

Salvar workflow ou segredo não comprova execução. Após publicar esta cópia e configurar os dois segredos, executar coleta manual, conferir resultado da rotina, ler o histórico público e conferir nova geração quando o TSE a disponibilizar. Geração inalterada pode terminar corretamente como `already-recorded`. Não registrar segredo nem cabeçalhos de autenticação em evidências públicas.

Ativação verificada em **2026-10-25 às 17:10:06 America/Belem**: a [execução do GitHub](https://github.com/theodcastroribeiro/presidencial-2026/actions/runs/40229465924) concluiu com sucesso, 29/29 fontes frescas, readback verificado e deduplicação `already-recorded`. O primeiro snapshot foi persistido às 17:08:56 e confirmado pela API pública de histórico. A [rodada contínua](https://github.com/theodcastroribeiro/presidencial-2026/actions/runs/40229511279) começou às 17:10:31; a agenda de cinco minutos está ativa na branch `main`. Isso comprova o caminho GitHub → endpoint autenticado → TSE → R2 → releitura, sem garantir ausência de falhas futuras.

Testes locais usam apenas fixtures e buckets em memória. Para retomar uma rodada contínua, abra **Actions → Coletar apuração pública → Run workflow**, selecione a branch `main` e marque `continuous`. Para uma checagem pontual, deixe desmarcado. Não é necessário fornecer o segredo manualmente; o workflow usa o segredo já configurado. Consulte o histórico público e a última execução em caso de atraso.
