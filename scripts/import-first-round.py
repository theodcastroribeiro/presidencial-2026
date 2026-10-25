#!/usr/bin/env python3
"""Importa referência presidencial oficial do 1º turno de 2026 (eleição 6257).

Percentuais de todos os válidos e da dupla 13+22 são campos separados.
Não cria uma curva temporal a partir dos totais finais.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

CONFIG_URL = 'https://resultados.tse.jus.br/oficial/comum/config/ele-c.json'
ELECTION_ID = '6257'
UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO ZZ'.split()
REGIONS = {'norte': ('Norte', ['AC','AP','AM','PA','RO','RR','TO']), 'nordeste': ('Nordeste', ['AL','BA','CE','MA','PB','PE','PI','RN','SE']), 'centro-oeste': ('Centro-Oeste', ['DF','GO','MT','MS']), 'sudeste': ('Sudeste', ['ES','MG','RJ','SP']), 'sul': ('Sul', ['PR','RS','SC'])}
HISTORY_ATTEMPTS = [
 'https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/Historico_Totalizacao_Presidente_BR_1T_2026.zip',
 'https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/Historico_Totalizacao_Presidente_BR_1T_2026.csv',
 'https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/Historico_Totalizacao_Presidente_BR_2026.zip',
]


def fetch(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        data = response.read()
        return json.loads(data), hashlib.sha256(data).hexdigest()


def count(value):
    value = str(value)
    assert value.isdigit(), f'Contagem inválida: {value}'
    return int(value)


def pct(numerator, denominator):
    return round(numerator / denominator * 100, 8) if denominator else None


def timestamp(date, time):
    return datetime.strptime(date + ' ' + time, '%d/%m/%Y %H:%M:%S').replace(tzinfo=ZoneInfo('America/Sao_Paulo')).isoformat()


def shares(scope):
    pair_votes = scope['lulaVotes'] + scope['bolsonaroVotes']
    scope.update(lulaPercent=pct(scope['lulaVotes'], scope['validVotes']), bolsonaroPercent=pct(scope['bolsonaroVotes'], scope['validVotes']), otherPercent=pct(scope['otherVotes'], scope['validVotes']), pairVotes=pair_votes, pairLulaPercent=pct(scope['lulaVotes'], pair_votes), pairBolsonaroPercent=pct(scope['bolsonaroVotes'], pair_votes), turnoutPercent=pct(scope['voters'], scope['electorate']), validYieldPercent=pct(scope['validVotes'], scope['electorate']))
    return scope


def one(uf):
    code = uf.lower()
    url = f'https://resultados.tse.jus.br/oficial/ele2026/{ELECTION_ID}/dados/{code}/{code}-c0001-e006257-u.json'
    raw, checksum = fetch(url)
    assert str(raw['ele']) == ELECTION_ID and str(raw['t']) == '1' and raw['f'] == 'o' and raw['cdabr'].upper() == uf
    assert raw['tf'] == 's', f'Resultado não final em {uf}'
    cargo = next(c for c in raw['carg'] if str(c['cd']) == '1')
    candidates = [dict(number=str(c['n']), name=c['nmu'], fullName=c['nm'], votes=count(c['vap']), destination=c['dvt'], officialPercent=float(c.get('pvapn', c['pvap']).replace(',', '.'))) for group in cargo['agr'] for party in group['par'] for c in party['cand']]
    by_number = {c['number']: c for c in candidates}
    assert len(by_number) == len(candidates)
    assert 'LULA' in by_number['13']['name'].upper() and any(n in by_number['22']['name'].upper() for n in ['FLAVIO', 'FLÁVIO'])
    assert all(c['destination'] == 'Válido' for c in candidates), f'Destinação inesperada em {uf}'
    valid = count(raw['v']['vv'])
    assert sum(c['votes'] for c in candidates) == valid, f'Votos dos candidatos não conciliados em {uf}'
    result = dict(uf=uf, code=uf, electorate=count(raw['e']['te']), electorateProcessed=count(raw['e']['est']), sections=count(raw['s']['ts']), sectionsProcessed=count(raw['s']['st']), validVotes=valid, lulaVotes=by_number['13']['votes'], bolsonaroVotes=by_number['22']['votes'], otherVotes=sum(c['votes'] for c in candidates if c['number'] not in ('13','22')), voters=count(raw['e']['c']), blankVotes=count(raw['v']['vb']), nullVotes=count(raw['v']['tvn']), abstentions=count(raw['e']['a']), sourceUpdatedAt=timestamp(raw['dg'],raw['hg']), totalizedAt=timestamp(raw['dt'],raw['ht']), final=True, source={'kind':'official','publisher':'Tribunal Superior Eleitoral','url':url,'sha256Json':checksum}, candidates=candidates)
    assert result['validVotes'] + result['blankVotes'] + result['nullVotes'] == result['voters']
    assert result['electorateProcessed'] == result['electorate'] and result['sectionsProcessed'] == result['sections']
    assert result['voters'] + result['abstentions'] <= result['electorate']
    return shares(result)


def history_manifest(imported_at):
    def check(url):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=15) as response:
                return {'url': url, 'httpStatus': response.status}
        except urllib.error.HTTPError as error:
            return {'url': url, 'httpStatus': error.code}
        except Exception as error:
            return {'url': url, 'error': str(error)}
    with ThreadPoolExecutor(max_workers=3) as pool:
        checks = list(pool.map(check, HISTORY_ATTEMPTS))
    found = [check['url'] for check in checks if check.get('httpStatus') == 200]
    # Um novo arquivo exige inspeção de esquema antes de virar curva do painel.
    reason = 'Arquivo potencial localizado, mas não importado nem validado; não há série temporal publicada neste painel.' if found else 'Série temporal não localizada na fonte consultada'
    return {
      'schemaVersion': 1, 'available': False, 'pointFields': [], 'points': [], 'scopes': {},
      'election': {'id': ELECTION_ID, 'year': 2026, 'round': 1, 'date': '2026-10-04', 'office': 'president'},
      'source': {'kind': 'source_search_manifest', 'consultedPublisher': 'Tribunal Superior Eleitoral', 'checkedAt': imported_at, 'checks': checks, 'potentialFilesRequiringReview': found},
      'reason': reason,
      'notes': ['A ausência neste painel não prova inexistência de qualquer arquivo histórico; registra as fontes consultadas.', 'Os resultados finais oficiais de 2026 estão em /data/first-round-2026.json. Eles não foram convertidos em uma curva temporal.', 'Não houve reconstrução da curva a partir de votos finais por seção ou horários inferidos.'],
    }


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'public'/'data'/'first-round-2026.json')
    args=parser.parse_args()
    config, checksum=fetch(CONFIG_URL)
    election=next(e for pleito in config['pl'] if pleito['c']=='ele2026' and pleito['dt']=='04/10/2026' for e in pleito['e'] if e['cd']==ELECTION_ID)
    assert election['t']=='1' and election['cdt2']=='6258' and any(cp['cd']=='1' for abr in election['abr'] for cp in abr['cp'])
    with ThreadPoolExecutor(max_workers=6) as pool:
        results=list(pool.map(one,['BR']+UFS))
    national,states=results[0],results[1:]
    sum_fields=['electorate','electorateProcessed','sections','sectionsProcessed','validVotes','lulaVotes','bolsonaroVotes','otherVotes','voters','blankVotes','nullVotes','abstentions']
    for field in sum_fields:
        assert sum(st[field] for st in states)==national[field],f'Soma das UFs diverge BR: {field}'
    regions=[]
    for code,(name,members) in REGIONS.items():
        included=[st for st in states if st['uf'] in members]
        totals={field:sum(st[field] for st in included) for field in sum_fields}
        regions.append(shares(dict(code=code,name=name,**totals,source={'kind':'panel_aggregation','official':False,'states':members})))
    imported_at = datetime.now(ZoneInfo('America/Belem')).isoformat(timespec='seconds')
    manifest = history_manifest(imported_at)
    result={
      'schemaVersion':1,
      'election':{'id':ELECTION_ID,'year':2026,'round':1,'date':'2026-10-04','office':'president','candidates':{'13':'Lula','22':'Flávio Bolsonaro'}},
      'source':{'kind':'official','publisher':'Tribunal Superior Eleitoral','importedAt':imported_at,'configUrl':CONFIG_URL,'configSha256Json':checksum,'scopeFiles':29},
      'percentBases':{'lulaPercent':'100 × lulaVotes / validVotes (todos os candidatos)','bolsonaroPercent':'100 × bolsonaroVotes / validVotes (todos os candidatos)','otherPercent':'100 × otherVotes / validVotes','pairLulaPercent':'100 × lulaVotes / (lulaVotes + bolsonaroVotes)','pairBolsonaroPercent':'100 × bolsonaroVotes / (lulaVotes + bolsonaroVotes)'},
      'national':national,'states':states,'regions':regions,
      'history':{'available':False,'manifest':'/data/historico-2026-1t.json','reason':manifest['reason'],'checkedAt':imported_at},
      'notes':['Todos os percentuais estão na escala 0 a 100. A dupla normalizada não representa votação observada do segundo turno.','Outros candidatos, abstenção, brancos e nulos podem migrar entre turnos; não presumir transferência automática para os finalistas.','O referencial 2026 contém Lula e Flávio Bolsonaro; o referencial 2022 contém Lula e Jair Bolsonaro.','BR é a divulgação oficial nacional. As cinco regiões são somas derivadas das UFs. Exterior (ZZ) é separado.'],
      'validation':{'scopeCount':29,'stateScopeCount':28,'nationalMatchesStateSums':True,'candidateVotesMatchValidVotes':True,'finalResultAllScopes':True},
    }
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
    manifest_path = args.output.with_name('historico-2026-1t.json')
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
    print(f'{manifest_path}: available=false; {manifest["reason"]}')
    print(f'{args.output}: {args.output.stat().st_size} bytes; {len(states)} UFs/Exterior; national={json.dumps({k:national[k] for k in ["lulaVotes","bolsonaroVotes","otherVotes","validVotes","lulaPercent","bolsonaroPercent","pairLulaPercent","pairBolsonaroPercent"]},ensure_ascii=False)}')


if __name__=='__main__':main()
