---
title: Publicação do painel presidencial
updated_at: 2026-10-25
timezone: America/Belem
status: published
tags: [eleicoes, publicacao, operacao]
---

# Publicação e operação

## Escopo autorizado

Publicar o painel para compartilhamento por link e seu código no GitHub, mantendo a versão existente funcionando em paralelo. Cores: Lula vermelho; Bolsonaro amarelo.

## Implementado em 2026-10-25

- Cópia pública independente, com armazenamento e segredo de coleta próprios.
- Metadados sociais e imagem de compartilhamento para WhatsApp.
- Resultados oficiais, comparação 2022/primeiro turno, destaque SP/MG/BA e recortes territoriais preservados.
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

As projeções são cenários territoriais, não resultados oficiais nem probabilidades calibradas. A combinação 50/50 das referências não foi validada por backtest. O TSE e as agendas de hospedagem podem apresentar atrasos. O histórico não recupera automaticamente parciais anteriores ao início da coleta.

## Operação

O [README](../README.md) aponta para o site e a rotina de atualização. [Coleta](coleta.md) documenta cadência, autenticação e retomada. [Método](historico.md) documenta fontes e denominadores. A coleta segue automaticamente; uma nova rodada contínua pode ser iniciada pelo workflow quando necessário, mantendo a agenda de cinco minutos como reforço.
