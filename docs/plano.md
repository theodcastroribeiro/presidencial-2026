---
title: Publicação do painel presidencial
updated_at: 2026-10-25
timezone: America/Belem
status: published
tags: [eleicoes, publicacao, operacao]
---

# Publicação e operação

## Escopo autorizado

Publicar o painel para compartilhamento por link e seu código no GitHub, mantendo a versão existente funcionando em paralelo. Cores atuais: Lula vermelho vibrante; Bolsonaro azul vibrante.

## Implementado em 2026-10-25

- Cópia pública independente, com armazenamento e segredo de coleta próprios.
- Metadados sociais e imagem de compartilhamento para WhatsApp.
- Resultados oficiais, histórico de 2022, recortes territoriais e acompanhamento de SP/MG/BA na parte inferior.
- Consultas públicas somente leitura; gravação do histórico por coletor autenticado.
- GitHub Actions com agenda de cinco minutos e execução contínua de um minuto, sem depender de computador ou navegador abertos.
- Preservação explícita da última leitura em caso de indisponibilidade da fonte, com projeção suspensa para dados antigos.

## Evidências executadas

Verificação em **2026-10-25**, fuso America/Belem:

- TypeScript sem erros, 44 testes existentes e 8 testes adicionais do coletor aprovados; lint dos novos módulos aprovado.
- Build e deploy concluídos às **17:08:16**, com ambiente secreto aplicado.
- Sem login: página, resultados, histórico e imagem social retornaram HTTP 200. Metadados Open Graph apontam para a imagem pública 1200×630. POST sem credencial pelo cliente Node retorna HTTP 401.
- Primeira coleta persistida às **17:08:56**: 29 fontes consultadas, leitura do objeto confirmada. Histórico público confirmou o registro e seus horários originais.
- [Execução no GitHub](https://github.com/theodcastroribeiro/presidencial-2026/actions/runs/40229465924) concluída com sucesso às **17:10:06**: 29/29 fontes frescas, readback verificado e geração repetida corretamente deduplicada (`already-recorded`).
- [Rodada contínua](https://github.com/theodcastroribeiro/presidencial-2026/actions/runs/40229511279) iniciada às **17:10:31**, com etapa de coleta em execução. Limite de 330 minutos por rodada; agenda permanente de cinco minutos também ativa.
- Referências selecionáveis e cores verificadas no navegador público; painel anterior continua publicado e com audiência preservada.
- Auditoria do commit inicial: 147 arquivos públicos, histórico Git novo, sem credenciais literais, conteúdo financeiro ou endereço da versão privada.

## Limites

As projeções são cenários territoriais, não resultados oficiais nem probabilidades calibradas. O TSE e as agendas de hospedagem podem apresentar atrasos. O histórico não recupera automaticamente parciais anteriores ao início da coleta.

## Operação

O [README](../README.md) aponta para o site e a rotina de atualização. [Coleta](coleta.md) documenta cadência, autenticação e retomada. [Método](historico.md) documenta fontes e denominadores. A coleta segue automaticamente; uma nova rodada contínua pode ser iniciada pelo workflow quando necessário, mantendo a agenda de cinco minutos como reforço.


## Ajuste de interface — 2026-10-25 (America/Belem)

Pedido de simplificação: SP/MG/BA movidos para o fim da página, depois da tabela territorial e das estatísticas. Os três cartões mostram somente a parcial atual. Removidos da interface o seletor de referências e todos os indicadores, linhas, textos e carregamento de dados do primeiro turno. A interface usa apenas a referência de 2022 já existente; nenhum cálculo estatístico foi acrescentado. A coleta automática e os endpoints permanecem preservados.

Validação: TypeScript aprovado nas duas cópias; navegador local confirmou ausência de referências ao primeiro turno e posicionamento dos cartões depois da tabela, antes do rodapé. Build e publicação seguem nesta entrega.


## Conferência e endereço GitHub Pages — 2026-10-25 (America/Belem)

Às **17:30:09**, os 29 arquivos oficiais consultados diretamente no TSE coincidiram com os campos exibidos pela API pública, sem recortes com falha. A geração nacional do arquivo oficial permanecia em **17:06:31**; o horário da consulta é distinto do horário da geração. O histórico deduplica versões iguais e não cria novo ponto apenas por consultar novamente.

Foi habilitado GitHub Pages público com HTTPS para `https://theodcastroribeiro.github.io/presidencial-2026/`. A interface reutiliza os mesmos componentes, com build estático independente; chamadas de leitura apontam para a API existente e dados estáticos usam o prefixo do repositório. O CORS permite apenas a origem pública do usuário no GitHub. Credenciais de coleta não são incluídas no frontend. Nenhum cálculo eleitoral foi acrescentado.

Build estático local aprovado. A entrega inclui publicar CORS no Sites, executar o workflow de Pages e validar a interface e as requisições reais no domínio github.io.


## Mapa e paleta - 2026-10-25 (America/Belem)

O usuário confirmou fazer somente o mapa nesta entrega. A geometria oficial simplificada do IBGE substitui o cartograma esquemático: 27 UFs, DF preservado e escala de cinza pelo avanço da apuração. Hover, foco do teclado e toque mostram informações do arquivo oficial; a seleção abre o recorte estadual existente. Cada leitura identifica a data e hora TSE. Fonte e transformação estão em [mapa](mapa.md).

A paleta passou a Lula vermelho vibrante `#ff3347` e Flávio Bolsonaro azul vibrante `#2f8cff`, com variáveis semânticas compartilhadas. Os gráficos não receberam novas funções nesta entrega. Atualizações automáticas e audiência dos sites permanecem preservadas.

Verificações executadas: 27 geometrias e DF; clique em PA; hover em MG mantendo a seleção PA; Enter selecionando MG; retorno a Brasil; paleta RGB correspondente; nenhum erro de console. Em viewport de 390px, o mapa e os detalhes empilham sem overflow, o seletor móvel tem alvo de 44px e seleciona o DF. TypeScript passou. Builds e publicação seguem nesta mesma entrega.


## Degradê e resultado no mapa - 2026-10-25 (America/Belem)

Pedido: substituir a escala de avanço por degradê azul/vermelho conforme a diferença dos percentuais oficiais, e consultar os resultados atuais ao selecionar uma UF. A interface usa os percentuais publicados, sem renormalização, em escala fixa simétrica. Dados ausentes ou ausência de votos válidos têm cor cinza. O detalhe identifica votos, percentuais, diferença em pontos percentuais, apuração, fonte e geração. Nenhum modelo de projeção ou gráfico histórico foi alterado.

Validação executada em 2026-10-25 às 19h16 (America/Belem): TypeScript e diff sem erros nas duas cópias; verificações da cor para sinais, extremos fixos, empate, dados ausentes e zero votos aprovadas. No navegador local, 27 UFs presentes, clique BA com resultado/fonte estadual, e em 390px seleção DF com duas linhas de candidatos, alvo de 44px e sem overflow da página ou da legenda. API pública respondeu 200, sem erros; SP/MG/BA conferidos com os arquivos oficiais, sem divergência nos valores verificados. Publicação segue nesta mesma entrega, mantendo a agenda e a coleta contínua existentes.


## Imagem compartilhável - 2026-10-25 (America/Belem)

Pedido: um botão para registrar os blocos de votação, apuração, gráfico comparativo e percentuais regionais, conforme o recorte Brasil/região/UF. A solução gera um PNG independente da largura do dispositivo, copia o SVG do gráfico exibido e preserva a leitura no clique. Prévia e download ficam no navegador; compartilhamento nativo de arquivo é opcional quando suportado. A rotina de coleta e os modelos existentes não são alterados. Consulte [compartilhamento](compartilhamento.md).

Validação executada em 2026-10-25 entre 19h26 e 19h28 (America/Belem): PNGs reais de Brasil, Nordeste e Bahia gerados e baixados; inspeção visual de Brasil e UF sem cortes. Em 390px, a captura estadual manteve 1600px de largura e o eixo Eleitorado escolhido; página e diálogo sem overflow. Escape e fechamento restauram o foco e o scroll. TypeScript passou nas duas cópias; componente novo sem erros de lint. Testes puros e mock de congelamento confirmaram zero/null, horários, SVG/lacunas, ausência de renormalização, freeze antes do await e avisos regionais. Publicação segue nesta entrega preservando os públicos e a coleta existentes.
