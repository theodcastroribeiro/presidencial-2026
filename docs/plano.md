---
title: Publicação do painel presidencial
updated_at: 2026-10-25
timezone: America/Belem
status: publishing
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

## Portão de publicação

Publicação em andamento: verificar build, tipos, testes, deploy, acesso anônimo, cores no navegador e primeira coleta com releitura persistente. Estado de teste proposto não é evidência de execução.

## Limites

As projeções são cenários territoriais, não resultados oficiais nem probabilidades calibradas. A combinação 50/50 das referências não foi validada por backtest. O TSE e as agendas de hospedagem podem apresentar atrasos. O histórico não recupera automaticamente parciais anteriores ao início da coleta.

## Operação

O [README](../README.md) aponta para o site e a rotina de atualização. [Coleta](coleta.md) documenta cadência, autenticação e retomada. [Método](historico.md) documenta fontes e denominadores. Próximo passo: concluir as verificações públicas e registrar seus resultados.
