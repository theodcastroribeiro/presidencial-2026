---
title: Resultados oficiais finais do primeiro turno
updated_at: 2026-10-25
timezone: America/Belem
status: implementado
tags: [tse, primeiro-turno, resultados, proveniencia]
---

# Resultado oficial do primeiro turno

O painel e a imagem exportada apresentam um bloco separado dos resultados do primeiro turno do recorte selecionado. Os registros identificam candidato, número, votos e percentual, em ordem numérica fixa. Não há ordenação por votação nem cálculo de diferenças neste bloco.

A identificação da eleição vem da [configuração oficial do TSE](https://resultados.tse.jus.br/oficial/comum/config/ele-c.json): eleição federal 6257, primeiro turno de 04/10/2026, cargo presidente. A fonte nacional é o [arquivo oficial do Brasil](https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json); os arquivos estaduais e do exterior usam os respectivos códigos na mesma distribuição. Cada registro conserva o endereço, geração e instante da consulta. A indicação de conclusão exige os campos oficiais de totalização e a cobertura completa.

Percentuais publicados usam todos os votos válidos definidos pela fonte. Não se usa a normalização entre dois candidatos dos arquivos legados de modelagem. Os dados exibidos abrangem todos os candidatos presentes no arquivo oficial. Regiões são agregações dos totais de suas UFs, com percentual derivado sobre todos os votos válidos e identificação explícita dessa natureza. O exterior permanece separado das cinco regiões.

O novo ativo é `public/data/official-first-round-results.json`, distinto dos arquivos legados de referência. O helper `lib/first-round-results.ts` seleciona Brasil, UF, região ou exterior. O bloco do PNG recebe o mesmo resultado do painel e é congelado com os demais dados no clique. Campos desconhecidos permanecem desconhecidos; zero conhecido continua zero.

## Verificação

Consulta executada em **2026-10-25 às 19:49:31, America/Belem**. Foram auditados 29 arquivos oficiais (Brasil, 27 UFs e exterior), todos com totalização final e 100% das seções. Há 12 candidaturas válidas em cada arquivo; nomes, números, partidos, contagens e campos publicados `pvap`/`pvapn` foram preservados. As contagens dos candidatos somam todos os votos válidos; UFs e exterior conciliam o arquivo nacional. Os cinco agregados regionais possuem cobertura completa e identificação de cálculo derivado.

O ativo possui **244.424 bytes**, SHA-256 `2d37db110987fb543bacf775a3cbac24aba444b9105018529a82f63c5d02f423`. São 34 recortes: 29 oficiais e cinco agregados. Fontes finais possuem gerações próprias; a consulta posterior não substitui a data oficial.

Verificações em **2026-10-25, entre 19h52 e 19h54, America/Belem**: TypeScript aprovado nas duas cópias; componentes e helper sem erros de lint; diff e links locais verificados. O navegador confirmou 12 candidaturas em ordem numérica, fonte e geração do Brasil e do Pará, e nove fontes para o Nordeste. PNGs de Brasil (1600×2701) e Nordeste (1600×2879) gerados no navegador; download real e inspeção do bloco final nacional sem cortes. Em 390px, a tabela completa cabe sem overflow após permitir quebra dos nomes. Testes puros cobriram zero/null, denominação do agregado, ordem, recorte incorreto, ausência de fonte, conclusão condicionada aos campos e congelamento de candidatos/fontes/cobertura antes do processamento assíncrono. Publicação conferida nesta mesma entrega.
