---
title: Imagem para compartilhar a apuração
updated_at: 2026-10-25
timezone: America/Belem
status: implementado
tags: [interface, imagem, compartilhamento, apuracao]
---

# Imagem da apuração

O botão **Salvar imagem**, junto das ações do topo, prepara um PNG do recorte selecionado: Brasil, região, UF ou exterior. A prévia oferece **Baixar PNG** e, quando o navegador permite compartilhar arquivos, **Compartilhar imagem**. O compartilhamento só acontece mediante ação do visitante e escolha do destino no próprio dispositivo. A exportação JSON existente permanece disponível.

A imagem reúne votação atual, percentuais dos candidatos, avanço das seções, eleitorado, eleitores pendentes, votos válidos, gráfico comparativo com 2022 e tabela das cinco regiões com percentuais de votação, apuração e pendência. A tabela regional é contexto do Brasil, inclusive quando o recorte principal é uma UF. Percentuais e totais regionais são agregados das UFs, como no painel.

O gráfico é uma cópia do SVG já exibido, preservando séries, eixo selecionado e lacunas. Nenhuma observação histórica é interpolada ou inventada para a imagem. O eixo e a distinção entre Lula/Jair Bolsonaro em 2022 e Lula/Flávio Bolsonaro no pleito atual acompanham o gráfico.

Os dados e o gráfico são capturados no clique. Atualizações posteriores do painel não modificam a imagem pronta. A geração TSE e o horário da captura são identificados separadamente no fuso America/Belem. Regiões agregam UFs com horários próprios; dados ausentes permanecem desconhecidos e leituras antigas recebem aviso.

A renderização acontece no navegador, com SVG independente convertido em canvas e PNG, sem envio a um serviço de captura, sem fontes remotas e sem dependência adicional. A resolução é fixa e não depende do tamanho da tela. Um PNG é um registro daquela leitura; não continua se atualizando depois de salvo.

## Verificação

Em 2026-10-25, entre 19h26 e 19h28 (America/Belem), o navegador gerou e baixou PNGs reais de Brasil, Nordeste e Bahia. A captura de Bahia usou o eixo Eleitorado em tela de 390px e manteve resolução de 1600px, sem overflow. Prévia, fechamento por Escape, restauração do foco e bloqueio do fundo foram verificados. O PNG do Brasil (1600×1636) e o estadual (1600×1569) foram inspecionados visualmente, com tabela e rodapé sem cortes. TypeScript passou nas duas cópias; o componente novo passou lint. Verificações com dados fictícios cobriram zero/null, horários distintos, preservação do SVG e lacunas, ausência de renormalização, congelamento anterior ao primeiro await, recursos externos rejeitados e aviso de cobertura regional incompleta. A publicação é conferida na mesma entrega.
