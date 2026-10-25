---
title: Malha geográfica das Unidades da Federação
updated_at: 2026-10-25
timezone: America/Belem
status: implementado
tags: [mapa, ibge, geografia, proveniencia]
---

# Malha geográfica das Unidades da Federação

Fonte consultada em **2026-10-25T18:43:01-03:00**, fuso `America/Belem`.

## Fonte primária e atribuição

A geometria vem diretamente da [API de Malhas Geográficas v3 do IBGE](https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=UF), consulta `paises/BR`, `intrarregiao=UF`, `qualidade=minima` e formato GeoJSON. A [documentação oficial](https://servicodados.ibge.gov.br/api/docs/malhas?versao=3) descreve essa API como uma distribuição de malhas simplificadas apropriada a aplicações web. A consulta retornou **27 feições**, incluindo o Distrito Federal, com **4.985 coordenadas em 36 anéis**. Não foi usado mapa desenhado manualmente nem uma base de terceiro.

Os códigos `codarea` das geometrias foram relacionados a siglas e nomes pela [API oficial de Localidades do IBGE](https://servicodados.ibge.gov.br/api/v1/localidades/estados). O conjunto resultante tem exatamente 26 estados e o Distrito Federal. Não inclui Exterior, países vizinhos ou territórios estrangeiros.

**Licença:** a resposta e a documentação da API consultada não identificam uma licença específica. O arquivo registra essa limitação, sem atribuir Creative Commons, domínio público ou outra licença por inferência. A atribuição é **IBGE — API de Malhas Geográficas v3**. O acesso público à API e a origem oficial não foram apresentados como prova de uma licença específica. O endereço institucional de termos de uso consultado não pôde ser lido (HTTP 403): `https://www.ibge.gov.br/acesso-informacao/institucional/termos-de-uso.html`.

**Período da malha:** não foi informado no pedido e não aparece na resposta GeoJSON. A data de download não deve ser tratada como ano de referência territorial. A API entrega uma malha simplificada; o ativo serve à visualização nacional e não a levantamentos cadastrais, medições precisas ou definição de limites legais.

## Arquivo e transformação

Ativo: [`public/data/brasil-ufs-map.json`](../public/data/brasil-ufs-map.json), **70,876 bytes**. Contrato:

```text
{viewBox:"0 0 700 650",source:{url,title,license,...},
 states:[{uf,name,path,label:[x,y]}]}
```

A transformação foi feita em Python com biblioteca padrão, sem nova dependência NPM:

1. Ler todos os polígonos e anéis `Polygon`/`MultiPolygon` do GeoJSON e resolver os códigos pela API de Localidades.
2. Aplicar uma projeção equiretangular de visualização: `x = longitude × cos(-14°)` e `y = -latitude`.
3. Calcular os extremos globais das 27 UFs e aplicar **uma mesma escala uniforme** a todas elas: `scale = min(640/(maxX-minX), 590/(maxY-minY))`. Centralizar no quadro de 700 × 650, com margem mínima de 30 unidades.
4. Arredondar as coordenadas resultantes a **0,01 unidade SVG**. Preservar todos os anéis e vértices fornecidos pela API; não há simplificação adicional, reposicionamento, ampliação ou recorte de UF. Cada anel usa `M`, `L` e fechamento `Z`.
5. Usar o maior polígono da UF para a posição do rótulo. Dentro dele, buscar um ponto com distância livre das bordas em uma grade 13 × 13, refinada quatro vezes. O ponto calculado precisa estar dentro do polígono e fora dos seus vazios.

O componente deve desenhar os caminhos com `fillRule="evenodd"`, preservando os vazios internos. A geometria real do Distrito Federal foi mantida, inclusive o recorte correspondente em Goiás. O rótulo do DF está em `[449.11, 348.28]` e o de Goiás em `[412.6, 362.25]`; sua distância é **39.09 unidades SVG**. A camada de interação pode ampliar o alvo do DF sem ampliar a sua geometria.

O arquivo contém apenas nomes, códigos, geometria e proveniência. Não inclui resultados de votação ou cálculos eleitorais.

## Integridade e verificação executada

| Insumo/artefato | SHA-256 |
| --- | --- |
| GeoJSON após descompressão HTTP | `07c671aa87aa1ab296c446de6294df9827112782537b996c0a160284907e7c0f` |
| Corpo gzip recebido da API | `0e63107eeb3977da61892e781b8b2510de55309a7560c21125cedf1a7458963d` |
| JSON de nomes/códigos das UFs | `7ca1368dea3af83cba1af84ae8a7e88f1173c97586831d086cc8b3c1ba9c6596` |
| JSON SVG derivado entregue | `2e77d59546ca49c9fa4350b1e778223997bf5fc370974548c9b53607bf765af5` |

Verificações executadas em **2026-10-25**: 27 códigos únicos e exatamente iguais aos da API de Localidades; presença do DF; preservação dos 36 anéis e 4.985 coordenadas de entrada; todos os caminhos não vazios e fechados; coordenadas dentro do `viewBox`; rótulos dentro do polígono correspondente e fora de vazios; separação dos rótulos de GO/DF superior a 28 unidades; JSON idêntico nas duas cópias do projeto. Uma renderização SVG local foi inspecionada visualmente: contorno nacional, fronteiras estaduais e recorte do DF preservados na escala simplificada. As regiões pequenas do litoral nordestino exigem atenção à legibilidade dos rótulos no componente responsivo.

O download bruto da API retornou `Content-Encoding: gzip`. A descompressão foi feita antes da leitura do JSON e os checksums acima distinguem os dois conteúdos. O JSON final conserva em `source` os endereços oficiais, data de consulta, checksums dos insumos, qualidade, transformação e regra de preenchimento.

## Núcleo reproduzível da conversão

O trecho abaixo lê os dois insumos oficiais e reproduz o JSON. Não contém configuração de hospedagem ou identificador privado.

```python
import json, math, hashlib, urllib.request, gzip
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo

SOURCE_URL='https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=UF'
NAMES_URL="https://servicodados.ibge.gov.br/api/v1/localidades/estados"
def read_url(url):
    data=urllib.request.urlopen(url,timeout=30).read()
    return gzip.decompress(data) if data.startswith(b"\x1f\x8b") else data
raw=read_url(SOURCE_URL)
locality_raw=read_url(NAMES_URL)
geo=json.loads(raw)
locations={str(s["id"]):s for s in json.loads(locality_raw)}
assert len(geo["features"])==27 and len(locations)==27
W,H,PAD=700,650,30
cos_lat=math.cos(math.radians(-14))
def plane(coordinate):
    lon,lat=coordinate
    return lon*cos_lat,-lat

def polygons(feature):
    geometry=feature['geometry']
    return [geometry['coordinates']] if geometry['type']=='Polygon' else geometry['coordinates']
all_xy=[plane(c) for f in geo['features'] for polygon in polygons(f) for ring in polygon for c in ring]
minx,miny=min(x for x,y in all_xy),min(y for x,y in all_xy)
maxx,maxy=max(x for x,y in all_xy),max(y for x,y in all_xy)
scale=min((W-2*PAD)/(maxx-minx),(H-2*PAD)/(maxy-miny))
offx=(W-scale*(maxx-minx))/2;offy=(H-scale*(maxy-miny))/2
def project(c):
    x,y=plane(c)
    return round(offx+(x-minx)*scale,2),round(offy+(y-miny)*scale,2)
def area(ring):
    return sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(ring,ring[1:]+ring[:1]))/2

def inside_ring(point,ring):
    x,y=point;hit=False
    for a,b in zip(ring,ring[1:]+ring[:1]):
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:hit=not hit
    return hit

def inside(point,polygon):
    return inside_ring(point,polygon[0]) and not any(inside_ring(point,hole) for hole in polygon[1:])

def distance_segment(p,a,b):
    dx,dy=b[0]-a[0],b[1]-a[1]
    t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy))) if dx*dx+dy*dy else 0
    return math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)

def label_point(polygon):
    # Find an interior point with clearance, refining a 13×13 grid four times.
    ring=polygon[0]
    left,right=min(x for x,y in ring),max(x for x,y in ring)
    top,bottom=min(y for x,y in ring),max(y for x,y in ring)
    best=None;best_distance=-1
    for _ in range(4):
        dx,dy=(right-left)/12,(bottom-top)/12
        for ix in range(13):
            for iy in range(13):
                point=(left+ix*dx,top+iy*dy)
                if not inside(point,polygon):continue
                distance=min(distance_segment(point,a,b) for r in polygon for a,b in zip(r,r[1:]+r[:1]))
                if distance>best_distance:best,best_distance=point,distance
        assert best is not None
        left,right=best[0]-dx,best[0]+dx
        top,bottom=best[1]-dy,best[1]+dy
    return [round(best[0],2),round(best[1],2)]

states=[];vertices=0;ring_count=0
for feature in geo['features']:
    loc=locations[feature['properties']['codarea']]
    projected=[[list(map(project,ring)) for ring in polygon] for polygon in polygons(feature)]
    path=[]
    for polygon in projected:
        for ring in polygon:
            assert len(ring)>=4 and ring[0]==ring[-1]
            vertices+=len(ring);ring_count+=1
            path.append('M'+'L'.join(f'{x:g},{y:g}' for x,y in ring[:-1])+'Z')
    largest=max(projected,key=lambda p:abs(area(p[0])))
    label=label_point(largest)
    assert inside(label,largest)
    states.append({'uf':loc['sigla'],'name':loc['nome'],'path':''.join(path),'label':label})
states.sort(key=lambda s:s['uf'])
assert {s['uf'] for s in states}=={s['sigla'] for s in locations.values()}
result={'viewBox':'0 0 700 650','source':{'url':SOURCE_URL,'title':'IBGE — API de Malhas Geográficas v3, Brasil por Unidade da Federação, qualidade mínima','license':'Licença específica não identificada na resposta nem na documentação da API consultada; atribuição ao IBGE preservada.','documentationUrl':'https://servicodados.ibge.gov.br/api/docs/malhas?versao=3','namesUrl':'https://servicodados.ibge.gov.br/api/v1/localidades/estados','retrievedAt':datetime.now(ZoneInfo('America/Belem')).isoformat(timespec='seconds'),'sha256GeoJson':hashlib.sha256(raw).hexdigest(),'sha256NamesJson':hashlib.sha256(locality_raw).hexdigest(),'quality':'minima','period':'Não especificado no pedido nem identificado na resposta; não atribuir ano à malha.','projection':'Equiretangular com paralelo padrão -14°, x=longitude×cos(-14°), y=-latitude; ajuste uniforme ao viewBox com margem mínima de 30; coordenadas arredondadas a 0,01 unidade SVG.','geometryProcessing':'Todos os polígonos, anéis e vértices fornecidos pela API foram mantidos; sem simplificação adicional, deslocamento ou ampliação das UFs.','fillRule':'evenodd','vertices':vertices,'rings':ring_count},'states':states}
encoded=(json.dumps(result,ensure_ascii=False,separators=(",",":"))+"\n").encode()
out=Path("public/data/brasil-ufs-map.json")
out.parent.mkdir(parents=True,exist_ok=True)
out.write_bytes(encoded)
```

A reprodução em outra data pode receber uma versão diferente da API e terá outra data de consulta; comparar os hashes dos insumos antes de esperar identidade de bytes.
