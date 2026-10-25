#!/usr/bin/env python3
"""Importa observações históricas reais, preservando fonte e contadores inteiros.

Sem argumentos, baixa apenas a curva nacional oficial (825 KB).
Para o baseline, passe --votes-csv e --details-zip. --with-uf-archive
baixa as curvas estaduais do arquivo público de Wesley Cota, em commit fixo,
e gera composições regionais identificadas como cálculo do painel.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import urllib.request
import zipfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

HISTORY_URL = 'https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/Historico_Totalizacao_Presidente_BR_2T_2022.zip'
VOTES_URL = 'https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2022.zip'
DETAIL_URL = 'https://cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_2022.zip'
ARCHIVE_COMMIT = 'f2a869e104fa5a2e3fdcdb594a9ad66326db2605'
ARCHIVE_URL = 'https://github.com/wcota/br_eleicoes_2022_2T'
FIELDS = ['at', 'sectionsPercent', 'electoratePercent', 'lulaPercent', 'bolsonaroPercent', 'lulaVotes', 'bolsonaroVotes', 'electorateProcessed', 'sections']
UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split()


def download(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def load_csv(data):
    reader = csv.DictReader(io.StringIO(data.decode('latin1')), delimiter=';')
    reader.fieldnames = [key.strip() for key in reader.fieldnames]
    return [{key: value.strip() for key, value in row.items()} for row in reader]


def percent(a, b):
    return round(a / b * 100, 5) if b else None


def date_pt(value):
    return datetime.strptime(value, '%d/%m/%Y %H:%M:%S').replace(tzinfo=ZoneInfo('America/Sao_Paulo')).isoformat()


def date_archive(value):
    return datetime.strptime(value, '%Y-%m-%d %H:%M:%S').replace(tzinfo=ZoneInfo('America/Sao_Paulo')).isoformat()


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
    print(f'{path}: {path.stat().st_size:,} bytes')


def import_history(data, imported_at):
    rows = load_csv(data)
    assert len(rows) > 5000, 'Arquivo histórico incompleto'
    points = []
    total_sections = int(rows[0]['QT_SECOES_TOTAL'])
    total_electorate = int(rows[0]['QT_APTOS_TOTAL'])
    for row in rows:
        assert row['SG_UE_UF'] == 'BR' and row['CD_CARGO'] == '1' and row['CD_ELEICAO'] == '545'
        assert int(row['QT_SECOES_TOTAL']) == total_sections
        assert int(row['QT_APTOS_TOTAL']) == total_electorate
        lula = int(row['LULA_QT_VOTOS_TOT_ACUMULADO'])
        bolsonaro = int(row['JAIR_BOLSONARO_QT_VOTOS_TOT_ACUMULADO'])
        valid = int(row['QT_VOTOS_CONCORRENTES_ACUMULADO'])
        sections = int(row['QT_SECOES_TOT_ACUMULADO'])
        electorate = int(row['QT_APTOS_TOT_ACUMULADO'])
        assert lula + bolsonaro == valid
        point = [date_pt(row['DT_TOTALIZACAO']), percent(sections, total_sections), percent(electorate, total_electorate), percent(lula, valid), percent(bolsonaro, valid), lula, bolsonaro, electorate, sections]
        if points:
            assert point[0] >= points[-1][0]
            assert sections >= points[-1][-1]
        points.append(point)
    final = rows[-1]
    return {
        'schemaVersion': 1,
        'election': {'year': 2022, 'round': 2, 'office': 'president', 'scope': 'BR', 'candidates': {'13': 'Lula', '22': 'Jair Bolsonaro'}},
        'source': {'kind': 'official', 'publisher': 'Tribunal Superior Eleitoral', 'url': HISTORY_URL, 'file': 'Historico_Totalizacao_Presidente_BR_2T_2022.csv', 'sha256Csv': sha(data), 'importedAt': imported_at, 'timezone': 'America/Sao_Paulo', 'percentCalculation': '100 × contador acumulado / denominador; cinco casas decimais', 'originalPercentScale': 'fração de 0 a 1; campos PE_*'},
        'totals': {'sections': total_sections, 'electorate': total_electorate},
        'final': {'lulaVotes': int(final['LULA_QT_VOTOS_TOT_ACUMULADO']), 'bolsonaroVotes': int(final['JAIR_BOLSONARO_QT_VOTOS_TOT_ACUMULADO']), 'validVotes': int(final['QT_VOTOS_CONCORRENTES_ACUMULADO']), 'voters': int(final['QT_VOTOS_TOTAL_ACUMULADO']), 'lulaPercent': points[-1][3], 'bolsonaroPercent': points[-1][4]},
        'pointFields': FIELDS,
        'points': points,
        'coverage': {'observedPoints': len(points), 'firstAt': points[0][0], 'lastAt': points[-1][0], 'interpolated': False, 'gaps': 'São eventos observados da totalização; intervalo entre pontos variável. Não há pontos sintéticos nem observações anteriores ao primeiro evento.'},
    }


def import_baseline(vote_data, detail_data, imported_at):
    states = defaultdict(lambda: dict(lulaVotes=0, bolsonaroVotes=0, validVotes=0, electorate=0, voters=0, blankVotes=0, nullVotes=0, sections=0))
    selected_votes = 0
    vote_rows = load_csv(vote_data)
    detail_rows = load_csv(detail_data)
    def generation(rows):
        first = rows[0]
        return date_pt(first['DT_GERACAO'] + ' ' + first['HH_GERACAO'])
    for row in vote_rows:
        if row['NR_TURNO'] != '2' or row['CD_CARGO'] != '1':
            continue
        candidate = row['NR_CANDIDATO']
        assert candidate in ('13', '22')
        states[row['SG_UF']]['lulaVotes' if candidate == '13' else 'bolsonaroVotes'] += int(row['QT_VOTOS_NOMINAIS_VALIDOS'])
        selected_votes += 1
    seen = set()
    for row in detail_rows:
        if row['NR_TURNO'] != '2' or row['CD_CARGO'] != '1':
            continue
        key = (row['SG_UF'], row['CD_MUNICIPIO'], row['NR_ZONA'], row['ST_VOTO_EM_TRANSITO'])
        assert key not in seen, f'Duplicata em detalhe: {key}'
        seen.add(key)
        state = states[row['SG_UF']]
        for target, source in [('validVotes', 'QT_TOTAL_VOTOS_VALIDOS'), ('electorate', 'QT_APTOS'), ('voters', 'QT_COMPARECIMENTO'), ('blankVotes', 'QT_VOTOS_BRANCOS'), ('nullVotes', 'QT_TOTAL_VOTOS_NULOS'), ('sections', 'QT_SECOES_PRINCIPAIS')]:
            state[target] += int(row[source])
    assert set(states) == set(UFS + ['ZZ'])
    for state in states.values():
        assert state['lulaVotes'] + state['bolsonaroVotes'] == state['validVotes']
        assert state['validVotes'] + state['blankVotes'] + state['nullVotes'] == state['voters']
        state['lulaPercent'] = percent(state['lulaVotes'], state['validVotes'])
        state['bolsonaroPercent'] = percent(state['bolsonaroVotes'], state['validVotes'])
        state['turnoutPercent'] = percent(state['voters'], state['electorate'])
    keys = ['lulaVotes', 'bolsonaroVotes', 'validVotes', 'electorate', 'voters', 'blankVotes', 'nullVotes', 'sections']
    totals = {key: sum(state[key] for state in states.values()) for key in keys}
    assert totals['lulaVotes'] == 60345999 and totals['bolsonaroVotes'] == 58206354
    assert totals['electorate'] == 156454011 and totals['sections'] == 472075
    totals.update(lulaPercent=percent(totals['lulaVotes'], totals['validVotes']), bolsonaroPercent=percent(totals['bolsonaroVotes'], totals['validVotes']))
    return {
        'schemaVersion': 1,
        'election': {'year': 2022, 'round': 2, 'office': 'president', 'candidates': {'13': 'Lula', '22': 'Jair Bolsonaro'}},
        'source': {'kind': 'official', 'publisher': 'Tribunal Superior Eleitoral', 'importedAt': imported_at, 'votes': {'url': VOTES_URL, 'file': 'votacao_candidato_munzona_2022_BR.csv', 'sha256Csv': sha(vote_data), 'generationAt': generation(vote_rows), 'filter': 'NR_TURNO=2,CD_CARGO=1; soma QT_VOTOS_NOMINAIS_VALIDOS por SG_UF e NR_CANDIDATO', 'selectedRows': selected_votes}, 'details': {'url': DETAIL_URL, 'file': 'detalhe_votacao_munzona_2022_BR.csv', 'sha256Csv': sha(detail_data), 'generationAt': generation(detail_rows), 'filter': 'NR_TURNO=2,CD_CARGO=1; soma por SG_UF', 'selectedRows': len(seen)}},
        'totals': totals,
        'states': [dict(uf=uf, **states[uf]) for uf in sorted(states)],
        'notes': ['ZZ identifica Exterior e não integra nenhuma das cinco regiões brasileiras.', 'electorate é o total de aptos; voters é comparecimento. Não são o mesmo denominador.', 'sections soma QT_SECOES_PRINCIPAIS e coincide com as 472075 seções do histórico nacional; QT_TOTAL_SECOES inclui seções agregadas e não deve ser usado para comparar progresso.'],
    }


def import_uf_archive(baseline, imported_at):
    def one(uf):
        url = f'https://raw.githubusercontent.com/wcota/br_eleicoes_2022_2T/{ARCHIVE_COMMIT}/{uf.lower()}.csv'
        data = download(url)
        rows = list(csv.DictReader(io.StringIO(data.decode('utf8'))))
        groups = defaultdict(dict)
        for row in rows:
            groups[row['date']][row['cand']] = row
        official = next(state for state in baseline['states'] if state['uf'] == uf)
        points = []
        for at, candidates in sorted(groups.items()):
            assert set(candidates) == {'Lula', 'Bolsonaro'}
            lula, bolsonaro = candidates['Lula'], candidates['Bolsonaro']
            assert lula['secoes_totalizadas'] == bolsonaro['secoes_totalizadas']
            lv, bv = int(lula['votos']), int(bolsonaro['votos'])
            if lv + bv == 0:
                continue  # Ausência de votos não é percentual observado de 0%.
            sections, electorate = int(lula['secoes_totalizadas']), int(lula['eleitores'])
            points.append([date_archive(at), percent(sections, official['sections']), percent(electorate, official['electorate']), percent(lv, lv + bv), percent(bv, lv + bv), lv, bv, electorate, sections])
        assert points[-1][5] == official['lulaVotes'] and points[-1][6] == official['bolsonaroVotes'], f'Fim do arquivo {uf} diverge do baseline TSE'
        return uf, {'source': {'kind': 'third_party_archive', 'publisher': 'Wesley Cota', 'originalPublisher': 'Tribunal Superior Eleitoral', 'repository': ARCHIVE_URL, 'commit': ARCHIVE_COMMIT, 'url': url, 'sha256Csv': sha(data), 'importedAt': imported_at, 'timestampMeaning': 'date é horário da coleta arquivada, não evento de totalização. Percentuais recalculados dos contadores com denominadores oficiais finais.'}, 'totals': {'sections': official['sections'], 'electorate': official['electorate']}, 'points': points, 'coverage': {'observedPoints': len(points), 'interpolated': False, 'finalMatchesOfficialBaseline': True}}
    with ThreadPoolExecutor(max_workers=6) as pool:
        scopes = dict(pool.map(one, UFS))
    return {'schemaVersion': 1, 'election': {'year': 2022, 'round': 2, 'office': 'president'}, 'pointFields': FIELDS, 'scopes': scopes, 'notes': ['Arquivo secundário de snapshots efetivamente observados do Divulga TSE, não série oficial hospedada pelo TSE.', 'Não foi localizada curva oficial estadual equivalente ao histórico nacional. As fontes são individuais por UF.', 'Exterior (ZZ) não tem curva neste arquivo; os totais oficiais do Exterior estão no baseline.', 'Eventos estaduais e nacional não são simultâneos. Não somar snapshots arbitrários para produzir uma curva regional observada.']}


REGIONS = {
    'norte': ('Norte', ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO']),
    'nordeste': ('Nordeste', ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE']),
    'centro-oeste': ('Centro-Oeste', ['DF', 'GO', 'MT', 'MS']),
    'sudeste': ('Sudeste', ['ES', 'MG', 'RJ', 'SP']),
    'sul': ('Sul', ['PR', 'RS', 'SC']),
}
REGIONAL_FIELDS = FIELDS + ['oldestSourceAt', 'latestSourceAt', 'forwardFilledStates']


def compose_regional_history(uf_history, baseline, imported_at):
    """Retém a última observação por UF em cortes cronológicos reais do arquivo.

    Isto é uma composição descritiva, nunca um evento oficial de totalização.
    Não há backfill, interpolação de votos nem uso de observações futuras.
    """
    fields = uf_history['pointFields']
    index = {name: fields.index(name) for name in FIELDS}
    official = {state['uf']: state for state in baseline['states']}
    scopes = {}
    for code, (name, ufs) in REGIONS.items():
        total_sections = sum(official[uf]['sections'] for uf in ufs)
        total_electorate = sum(official[uf]['electorate'] for uf in ufs)
        events = defaultdict(list)
        for uf in ufs:
            for point in uf_history['scopes'][uf]['points']:
                assert point[index['lulaVotes']] + point[index['bolsonaroVotes']] > 0
                events[point[index['at']]].append((uf, point))
        latest = {}
        points = []
        discarded = 0
        max_lag = 0
        for at, updates in sorted(events.items()):
            # Atualizações do mesmo horário entram juntas; a ordem de UF não altera o corte.
            for uf, point in updates:
                latest[uf] = point
            if len(latest) != len(ufs):
                discarded += 1
                continue
            assert all(point[index['at']] <= at for point in latest.values())
            lula = sum(point[index['lulaVotes']] for point in latest.values())
            bolsonaro = sum(point[index['bolsonaroVotes']] for point in latest.values())
            electorate = sum(point[index['electorateProcessed']] for point in latest.values())
            sections = sum(point[index['sections']] for point in latest.values())
            timestamps = [point[index['at']] for point in latest.values()]
            oldest, newest = min(timestamps), max(timestamps)
            assert newest == at
            carried = sum(stamp < at for stamp in timestamps)
            lag = int((datetime.fromisoformat(newest) - datetime.fromisoformat(oldest)).total_seconds())
            max_lag = max(max_lag, lag)
            points.append([at, percent(sections, total_sections), percent(electorate, total_electorate), percent(lula, lula + bolsonaro), percent(bolsonaro, lula + bolsonaro), lula, bolsonaro, electorate, sections, oldest, newest, carried])
        assert points, f'Região sem cobertura completa: {code}'
        final_lula = sum(official[uf]['lulaVotes'] for uf in ufs)
        final_bolsonaro = sum(official[uf]['bolsonaroVotes'] for uf in ufs)
        assert points[-1][5] == final_lula and points[-1][6] == final_bolsonaro
        assert points[-1][8] == total_sections
        scopes[code] = {
            'name': name,
            'source': {
                'kind': 'panel_composition', 'official': False,
                'label': 'Composição regional do painel a partir de arquivo de terceiro de snapshots TSE',
                'publisher': 'Observatório', 'originalPublisher': 'Tribunal Superior Eleitoral',
                'archivePublisher': 'Wesley Cota', 'repository': ARCHIVE_URL, 'commit': ARCHIVE_COMMIT,
                'importedAt': imported_at,
                'method': 'Cortes nos horários de coleta arquivados; em cada corte, soma a última observação conhecida de cada UF (forward-fill descritivo), sem usar observação futura. Publica apenas após todas as UFs terem observação com votos válidos. Sem interpolação de contagens.',
                'timestampMeaning': 'at é o corte cronológico da composição; oldestSourceAt/latestSourceAt são os horários de coleta das observações retidas. Não são eventos de totalização regional publicados pelo TSE.',
                'percentCalculation': '100 × soma dos contadores observados / soma dos denominadores oficiais finais das UFs; participação dos candidatos usa soma dos votos válidos observados.',
                'inputArchive': '/data/historico-2022-uf.json',
                'inputBaseline': '/data/baseline-2022.json',
                'states': {uf: uf_history['scopes'][uf]['source'] for uf in ufs},
            },
            'totals': {'sections': total_sections, 'electorate': total_electorate},
            'final': {'lulaVotes': final_lula, 'bolsonaroVotes': final_bolsonaro, 'validVotes': final_lula + final_bolsonaro, 'lulaPercent': percent(final_lula, final_lula + final_bolsonaro), 'bolsonaroPercent': percent(final_bolsonaro, final_lula + final_bolsonaro)},
            'points': points,
            'coverage': {'expectedStates': ufs, 'availableStates': len(ufs), 'completeAtEveryPoint': True, 'composedPoints': len(points), 'observedInputSnapshots': sum(len(uf_history['scopes'][uf]['points']) for uf in ufs), 'discardedCutsBeforeFullCoverage': discarded, 'firstAt': points[0][0], 'lastAt': points[-1][0], 'maxSourceLagSeconds': max_lag, 'interpolated': False, 'forwardFill': True, 'finalMatchesOfficialBaseline': True},
        }
    return {'schemaVersion': 1, 'election': {'year': 2022, 'round': 2, 'office': 'president', 'candidates': {'13': 'Lula', '22': 'Jair Bolsonaro'}}, 'pointFields': REGIONAL_FIELDS, 'scopes': scopes, 'notes': ['Série derivada do painel; não é histórico regional oficial do TSE.', 'Em cada corte são somadas observações arquivadas de horários diferentes, sempre anteriores ou iguais ao corte. A diferença temporal é exposta em cada ponto.', 'Nenhuma UF recebe valores anteriores à primeira observação válida. Cada região começa somente com cobertura completa.', 'As contagens são observadas nas UFs; os pontos regionais são composições derivadas, não novas observações oficiais.', 'Exterior não integra as cinco regiões.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--history-csv', type=Path)
    parser.add_argument('--votes-csv', type=Path)
    parser.add_argument('--details-zip', type=Path)
    parser.add_argument('--with-uf-archive', action='store_true')
    parser.add_argument('--regions-from-existing', action='store_true', help='Compõe apenas regiões dos JSON estaduais e baseline já presentes no output-dir')
    parser.add_argument('--output-dir', type=Path, default=Path(__file__).resolve().parents[1] / 'public' / 'data')
    args = parser.parse_args()
    imported_at = datetime.now(ZoneInfo('America/Belem')).isoformat(timespec='seconds')
    if args.regions_from_existing:
        uf_history = json.loads((args.output_dir / 'historico-2022-uf.json').read_text(encoding='utf8'))
        baseline = json.loads((args.output_dir / 'baseline-2022.json').read_text(encoding='utf8'))
        write_json(args.output_dir / 'historico-2022-regioes.json', compose_regional_history(uf_history, baseline, imported_at))
        return
    if args.history_csv:
        history_data = args.history_csv.read_bytes()
    else:
        archive = zipfile.ZipFile(io.BytesIO(download(HISTORY_URL)))
        history_data = archive.read('Historico_Totalizacao_Presidente_BR_2T_2022.csv')
    history = import_history(history_data, imported_at)
    write_json(args.output_dir / 'historico-2022.json', history)
    if args.votes_csv:
        details_zip = args.details_zip.read_bytes() if args.details_zip else download(DETAIL_URL)
        details = zipfile.ZipFile(io.BytesIO(details_zip)).read('detalhe_votacao_munzona_2022_BR.csv')
        baseline = import_baseline(args.votes_csv.read_bytes(), details, imported_at)
        assert baseline['totals']['lulaVotes'] == history['final']['lulaVotes']
        assert baseline['totals']['bolsonaroVotes'] == history['final']['bolsonaroVotes']
        write_json(args.output_dir / 'baseline-2022.json', baseline)
        if args.with_uf_archive:
            uf_history = import_uf_archive(baseline, imported_at)
            write_json(args.output_dir / 'historico-2022-uf.json', uf_history)
            write_json(args.output_dir / 'historico-2022-regioes.json', compose_regional_history(uf_history, baseline, imported_at))
    elif args.with_uf_archive:
        parser.error('--with-uf-archive exige --votes-csv para validar cada resultado final')


if __name__ == '__main__':
    main()
