---
title: Curva de avanço da apuração
updated_at: 2026-10-25
timezone: America/Belem
status: implementado
tags: [apuracao, projecao, interface]
---

# Curva de avanço da apuração

Pedido: adicionar, ao lado da projeção do resultado, um gráfico do avanço das seções e de sua projeção. O gráfico acompanha o recorte selecionado e também integra a imagem compartilhável. No desktop, o controle de sensibilidade existente fica abaixo do resultado, e a curva ocupa a coluna ao lado. Em telas pequenas, os cartões ficam empilhados.

## Fonte

As observações vêm da mesma [API pública de histórico](https://presidencial-2026-publico.theodcastroribeiro.chatgpt.site/api/history?scope=BR&limit=300) e da parcial atual do painel. O [arquivo nacional oficial](https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json) fornece o percentual de seções totalizadas; UF e exterior usam seus respectivos arquivos. Para Brasil e UF, o eixo temporal usa a geração da fonte. Para regiões, usa a coleta do agregado, pois as UFs possuem gerações diferentes. As regiões são identificadas como agregações do painel.

## Apresentação

Linha contínua e pontos representam observações. A continuação tracejada e a faixa colorida são cenários independentes do painel. A faixa descreve variação de ritmo e não é um intervalo de confiança calibrado. A projeção de avanço não utiliza percentuais de candidatos nem modifica o modelo de resultado.

A estimativa usa apenas o ritmo recente da apuração, para um horizonte de 30 minutos a partir da última observação. O avanço pode mudar com a transmissão das urnas; extrapolar até 100% não fornece um horário garantido de encerramento. Fonte antiga, histórico insuficiente ou cobertura incompleta deixam apenas a curva observada e uma explicação da ausência de estimativa.

## Cálculo

O ajuste usa o trecho contínuo dos últimos 30 minutos, com pelo menos seis observações que cubram dez minutos. Para cada observação, mede-se o avanço em uma janela entre cinco e dez minutos, escolhendo o intervalo mais próximo de 7,5 minutos disponível. A mediana dessas taxas, em pontos percentuais de seções por minuto, define o cenário central. Os quartis 25% e 75% definem a dispersão observada; aplica-se um piso de 0,02 p.p./min ou 15% do ritmo mediano, o maior. Esse piso é uma hipótese do cenário, não um erro estatístico estimado.

A extrapolação começa na última observação e percorre 30 minutos, limitada ao eixo de 0% a 100%. Atingir o teto do cenário não confirma a conclusão. O painel suspende a extrapolação com fonte/consulta acima de cinco minutos, histórico parcial ou insuficiente e cobertura incompleta. Falta de avanço preserva uma taxa central zero, em vez de inventar progresso.

## Histórico e limites

Não se inventam registros anteriores à coleta nem dentro de lacunas. O formato atual do histórico guarda percentuais e eleitorado, mas não a contagem de seções de cada ponto antigo; alterações históricas no denominador das seções não podem ser verificadas retrospectivamente. Regressões na série e alterações de denominador, quando os campos existem, reiniciam a janela usada na estimativa.

## Verificação

Em 2026-10-25, entre 20h24 e 20h28 (America/Belem), a verificação usou a interface local com a API pública real. Brasil, Nordeste e Pará exibiram a série observada e os cenários; o recorte regional identificou o relógio de coleta. No desktop de 1440px, a curva ficou ao lado do resultado e da sensibilidade; em 390px, os cartões se empilharam sem overflow. Leitura por botão/teclado distinguiu ponto observado de cenário.

PNGs reais foram gerados para Brasil (1600×3521), Nordeste (1600×3784) e Pará (1600×3548, captura em viewport de 390px). O PNG nacional foi baixado e inspecionado: curva, faixa, tracejado, lacunas, notas, fonte, regiões e primeiro turno preservados sem cortes. As dimensões variam com notas e recorte.

Quinze testes novos verificaram ritmo linear e nulo, quantidade/duração mínimas, lacunas, regressão, denominador conhecido e legado, relógio regional, leitura antiga, cobertura parcial, percentual desconhecido, registros preservados, fonte da âncora e teto visual. A suíte completa passou: 67 testes. TypeScript e verificação de diff passaram nas duas cópias. Testes do exportador verificaram congelamento anterior ao primeiro processamento assíncrono, escopo, preservação dos caminhos e rejeição de SVGs inseguros. Uma revisão independente conferiu Brasil, Nordeste, Pará e exterior contra a API pública.

A publicação utiliza o fluxo existente de Sites e GitHub Pages. O resultado de implantação e a conferência do endereço público acompanham a entrega.
