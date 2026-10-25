# Observatório · Presidencial 2026

Painel independente para acompanhar a apuração presidencial do segundo turno de 2026, com resultados do TSE, curvas de 2022 e cenários para os votos pendentes.

**[Abrir o site no GitHub Pages](https://theodcastroribeiro.github.io/presidencial-2026/)** · [Versão pública no Sites](https://presidencial-2026-publico.theodcastroribeiro.chatgpt.site) · [Código no GitHub](https://github.com/theodcastroribeiro/presidencial-2026) · [Coleta automática](https://github.com/theodcastroribeiro/presidencial-2026/actions/workflows/collect.yml)

## O que o painel mostra

- Lula em **vermelho vibrante** e Flávio Bolsonaro em **azul vibrante**. A referência de 2022 identifica Jair Bolsonaro separadamente.
- Acompanhamento atual de SP, MG e BA na parte inferior da página.
- Brasil, cinco regiões, 27 UFs e exterior, com apuração, eleitorado e pendência.
- Curvas comparadas pelo avanço da apuração, com histórico de 2022.
- Projeção territorial dos votos pendentes e análise de sensibilidade. É estimativa independente, sem probabilidade de vitória ou ganho de precisão demonstrado.

## Atualização

A tela consulta os arquivos oficiais a cada 60 segundos. A coleta em nuvem funciona sem navegador aberto: GitHub Actions executa uma consulta programada a cada cinco minutos e permite uma rodada contínua por minuto, durante até 330 minutos por execução. Os registros ficam no armazenamento persistente do site e não dependem deste computador.

O painel mostra o horário da geração oficial e marca leituras preservadas em caso de falha. Agendas externas e o cache do TSE podem causar atraso; não existe garantia de disponibilidade ininterrupta. A mesma geração oficial não cria pontos repetidos no histórico.

Consulte [coleta e operação](docs/coleta.md), [fontes e método](docs/historico.md) e [estado da entrega](docs/plano.md). O histórico de 2026 começa com a coleta deste projeto; lacunas não são preenchidas com observações inventadas.

## Fontes

- [TSE · resultado nacional do segundo turno de 2026](https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json), com os arquivos equivalentes para cada UF e exterior.
- [TSE · primeiro turno de 2026](https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json).
- [TSE · histórico nacional de 2022](https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/Historico_Totalizacao_Presidente_BR_2T_2022.zip).
- [Wesley Cota · snapshots estaduais de 2022](https://github.com/wcota/br_eleicoes_2022_2T), identificados como arquivo de terceiro e conciliados com os totais oficiais.

## Desenvolvimento

Node.js 24 recomendado. O projeto usa React, TypeScript, Vinext/Vite e o runtime de Sites/Cloudflare Workers.

```sh
npm ci
npm run dev
npx tsc --noEmit
node --experimental-strip-types --test tests/*.test.*
npm run build
```

As consultas públicas são somente leitura. `POST /api/refresh` exige `COLLECTOR_TOKEN` no servidor e o segredo correspondente `PUBLIC_COLLECTOR_TOKEN` no GitHub Actions. Nenhum segredo deve entrar no código, em argumentos de comando, nos arquivos de publicação ou no Git. O manifesto `.openai/hosting.json` contém apenas o identificador público e as bindings da aplicação.

Atualizado em 2026-10-25, fuso America/Belem.


## GitHub Pages

A mesma interface é publicada em `https://theodcastroribeiro.github.io/presidencial-2026/`. O workflow `.github/workflows/pages.yml` constrói a entrada React estática de `github-pages/` com `vite.pages.config.ts` a cada push na branch `main`, sem alterar o build Sites. A saída `dist-pages/` não é versionada.

Os arquivos da interface e referências públicas ficam no GitHub Pages; os GET de resultados e histórico consultam a API pública existente no Sites, com CORS restrito à origem `https://theodcastroribeiro.github.io`. Nenhum segredo é enviado ao navegador. O coletor e seu armazenamento continuam na infraestrutura existente, assim como o painel anterior.


## Mapa interativo

O mapa geográfico de 27 UFs usa a malha simplificada oficial do IBGE. Passe o cursor, use o foco do teclado ou toque numa UF para consultar a apuração atual e a data do arquivo TSE. Clique ou pressione Enter para abrir o recorte estadual. A escala neutra de cinza indica percentual de seções apuradas. Veja [fonte e transformação da geometria](docs/mapa.md).

Paleta atual: Lula vermelho vibrante `#ff3347`; Flávio Bolsonaro azul vibrante `#2f8cff`.
