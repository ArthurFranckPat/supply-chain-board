#!/usr/bin/env python3
"""
Matching commandes clients NOR/MTO → Ordres de Fabrication.

Structure des données :
    data_dir/statique/articles.csv
    data_dir/dynamique/besoins_clients.csv, of_entetes.csv, stock.csv

Filtrage commandes : TYPE_COMMANDE in ('MTO', 'NOR') pour NOR/MTO
                     TYPE_COMMANDE = 'MTS' pour MTS

Usage:
    python3 matching.py --data-dir data --horizon 3
    python3 matching.py --data-dir data --type MTO,NOR --output matching.json
"""
import argparse
import os
import json
import sys
from datetime import date, timedelta
from collections import defaultdict

import pandas as pd


# ---------------------------------------------------------------------------
# Chemins
# ---------------------------------------------------------------------------

_STATIQUE = {'articles', 'gammes', 'nomenclatures'}

def csv_path(data_dir: str, name: str) -> str:
    return f"{data_dir}/{'statique' if name in _STATIQUE else 'dynamique'}/{name}.csv"


def load_csv(path: str) -> pd.DataFrame:
    for enc in ('utf-8-sig', 'latin-1'):
        try:
            df = pd.read_csv(path, sep=';', encoding=enc, decimal=',')
            df.columns = [c.strip().strip('"') for c in df.columns]
            return df
        except UnicodeDecodeError:
            continue
    raise RuntimeError(f"Impossible de lire {path}")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def week_bounds(ref: date, offset: int):
    monday = ref - timedelta(days=ref.weekday())
    m = monday + timedelta(weeks=offset)
    return m, m + timedelta(days=4)


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------

def run_matching(data_dir: str, date_ref: date = None, horizon: int = 3,
                 types_commande: list = None) -> dict:
    if date_ref is None:
        date_ref = date.today()
    if types_commande is None:
        types_commande = ['MTO', 'NOR']

    # --- Chargement ---
    commandes = load_csv(csv_path(data_dir, 'besoins_clients'))
    of_ent    = load_csv(csv_path(data_dir, 'of_entetes'))
    stock_df  = load_csv(csv_path(data_dir, 'stock'))
    articles  = load_csv(csv_path(data_dir, 'articles'))

    commandes['DATE_EXPEDITION_DEMANDEE'] = pd.to_datetime(
        commandes['DATE_EXPEDITION_DEMANDEE'], dayfirst=True, errors='coerce')
    of_ent['DATE_FIN']    = pd.to_datetime(of_ent['DATE_FIN'], dayfirst=True, errors='coerce')
    of_ent['QTE_RESTANTE']= pd.to_numeric(of_ent['QTE_RESTANTE'], errors='coerce').fillna(0)
    of_ent['STATUT_NUM_OF'] = pd.to_numeric(
        of_ent['STATUT_NUM_OF'].astype(str).str.strip(), errors='coerce').fillna(0).astype(int)
    commandes['QTE_RESTANTE'] = pd.to_numeric(commandes['QTE_RESTANTE'], errors='coerce').fillna(0)

    for col in ('STOCK_PHYSIQUE', 'STOCK_ALLOUE', 'STOCK_BLOQUE'):
        stock_df[col] = pd.to_numeric(stock_df[col], errors='coerce').fillna(0)

    # --- Index articles TYPE_APPRO ---
    art_idx = {str(r['ARTICLE']).strip(): str(r.get('TYPE_APPRO', 'ACHAT')).strip().upper()
               for _, r in articles.iterrows()}

    # --- Stock virtuel ---
    stock_virt: dict[str, float] = {}
    for _, row in stock_df.iterrows():
        art = str(row['ARTICLE']).strip()
        stock_virt[art] = max(0.0,
            float(row['STOCK_PHYSIQUE']) - float(row['STOCK_ALLOUE']) - float(row['STOCK_BLOQUE']))

    # --- OF disponibles ---
    of_conso: dict[str, float] = {}
    of_meta:  dict[str, dict]  = {}
    for _, row in of_ent[of_ent['QTE_RESTANTE'] > 0].iterrows():
        num = str(row['NUM_OF']).strip()
        of_conso[num] = float(row['QTE_RESTANTE'])
        of_meta[num]  = {
            'article':  str(row['ARTICLE']).strip(),
            'statut':   int(row['STATUT_NUM_OF']),
            'date_fin': row['DATE_FIN'],
            'qte_init': float(row['QTE_RESTANTE']),
        }

    def of_priority_key(num: str, date_exp):
        m    = of_meta[num]
        prio = 0 if m['statut'] == 1 else 1
        ecart= abs((m['date_fin'] - date_exp).days) if pd.notna(m['date_fin']) and pd.notna(date_exp) else 9999
        return (prio, ecart, -of_conso.get(num, 0))

    def get_of(article: str, date_exp):
        nums = [n for n, m in of_meta.items() if m['article'] == article and of_conso.get(n, 0) > 0]
        nums.sort(key=lambda n: of_priority_key(n, date_exp))
        return nums

    # --- Horizon ---
    if horizon > 0:
        _, fin_h = week_bounds(date_ref, horizon)
        fin_h_ts = pd.Timestamp(fin_h)
    else:
        fin_h_ts = None

    # --- Filtrer commandes ---
    # TYPE_COMMANDE contient les valeurs 'MTO', 'NOR', 'MTS'
    types_upper = [t.upper().strip() for t in types_commande]
    mask = (
        commandes['TYPE_COMMANDE'].astype(str).str.strip().str.upper().isin(types_upper) &
        (commandes['QTE_RESTANTE'] > 0)
    )
    if fin_h_ts is not None:
        mask &= commandes['DATE_EXPEDITION_DEMANDEE'] <= fin_h_ts

    coms = commandes[mask].copy().sort_values('DATE_EXPEDITION_DEMANDEE', na_position='last')

    # --- Matching ---
    results = []

    for _, row in coms.iterrows():
        num_cmd      = str(row['NUM_COMMANDE']).strip()
        client       = str(row.get('NOM_CLIENT', '')).strip()
        article      = str(row['ARTICLE']).strip()
        besoin       = float(row['QTE_RESTANTE'])
        date_exp     = row['DATE_EXPEDITION_DEMANDEE']
        type_cmd     = str(row.get('TYPE_COMMANDE', '')).strip().upper()
        type_appro   = art_idx.get(article, 'ACHAT')

        # a) Stock
        stock_alloue = min(besoin, stock_virt.get(article, 0.0))
        stock_virt[article] = max(0.0, stock_virt.get(article, 0.0) - stock_alloue)
        besoin_net   = besoin - stock_alloue

        res = {
            'num_commande':  num_cmd,
            'client':        client,
            'article':       article,
            'type_commande': type_cmd,
            'qte_demandee':  besoin,
            'date_exp':      str(date_exp.date()) if pd.notna(date_exp) else None,
            'stock_alloue':  round(stock_alloue, 3),
            'besoin_net':    round(besoin_net, 3),
            'of_utilises':   [],
            'statut':        None,
            'qte_couverte':  round(stock_alloue, 3),
            'qte_manquante': 0.0,
        }

        if besoin_net == 0:
            res['statut'] = 'COUVERT_STOCK'
            results.append(res)
            continue

        if type_appro == 'ACHAT':
            res['statut']        = 'BESOIN_APPRO'
            res['qte_manquante'] = round(besoin_net, 3)
            results.append(res)
            continue

        # b) Chercher OF
        restant      = besoin_net
        for num_of in get_of(article, date_exp):
            if restant <= 0:
                break
            utilise = min(restant, of_conso[num_of])
            of_conso[num_of] -= utilise
            restant -= utilise
            res['of_utilises'].append({
                'num_of':    num_of,
                'statut_of': of_meta[num_of]['statut'],
                'type_of':   'Affermi' if of_meta[num_of]['statut'] == 1 else 'Suggéré',
                'date_fin':  str(of_meta[num_of]['date_fin'].date()) if pd.notna(of_meta[num_of]['date_fin']) else None,
                'qte_prise': round(utilise, 3),
            })

        res['qte_couverte']  = round(besoin - restant, 3)
        res['qte_manquante'] = round(restant, 3)

        if restant <= 0:
            types_of = {o['statut_of'] for o in res['of_utilises']}
            res['statut'] = ('COUVERT_OF_AFFERMI' if types_of == {1} else
                             'COUVERT_OF_SUGGERE' if types_of == {3} else
                             'COUVERT_OF_MIXTE')
        elif res['qte_couverte'] > 0:
            res['statut'] = 'PARTIEL'
        else:
            res['statut'] = 'NON_COUVERT'

        results.append(res)

    # --- Stats ---
    def cnt(s): return sum(1 for r in results if r['statut'] == s)
    couvert = cnt('COUVERT_STOCK') + cnt('COUVERT_OF_AFFERMI') + cnt('COUVERT_OF_SUGGERE') + cnt('COUVERT_OF_MIXTE')
    stats = {
        'total':              len(results),
        'couvert_stock':      cnt('COUVERT_STOCK'),
        'couvert_of_affermi': cnt('COUVERT_OF_AFFERMI'),
        'couvert_of_suggere': cnt('COUVERT_OF_SUGGERE'),
        'couvert_of_mixte':   cnt('COUVERT_OF_MIXTE'),
        'partiel':            cnt('PARTIEL'),
        'non_couvert':        cnt('NON_COUVERT'),
        'besoin_appro':       cnt('BESOIN_APPRO'),
        'taux_service_pct':   round(couvert / len(results) * 100, 1) if results else 0.0,
    }

    # OF partagés
    of_usage: dict[str, list] = defaultdict(list)
    for r in results:
        for o in r['of_utilises']:
            of_usage[o['num_of']].append(r['num_commande'])
    of_partages = [
        {'num_of': n, 'nb_commandes': len(cmds), 'commandes': cmds,
         'qte_init': of_meta[n]['qte_init'], 'qte_restante': round(of_conso.get(n, 0), 3)}
        for n, cmds in of_usage.items() if len(cmds) > 1
    ]

    return {
        'meta':       {'date_ref': str(date_ref), 'horizon': horizon, 'types': types_commande, 'nb_commandes': len(results)},
        'stats':      stats,
        'resultats':  results,
        'of_partages': of_partages,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Matching commandes → OF')
    parser.add_argument('--data-dir',  default=os.environ.get('ORDO_EXTRACTIONS_DIR', 'data'))
    parser.add_argument('--date-ref',  default=str(date.today()))
    parser.add_argument('--horizon',   type=int, default=3)
    parser.add_argument('--type',      default='MTO,NOR',
                        help='Types de commande à traiter (ex: MTO,NOR ou MTS)')
    parser.add_argument('--output',    help='Fichier JSON de sortie')
    args = parser.parse_args()

    types = [t.strip() for t in args.type.split(',')]
    result = run_matching(args.data_dir, date.fromisoformat(args.date_ref), args.horizon, types)

    out = json.dumps(result, ensure_ascii=False, indent=2, default=str)
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(out)
        print(f"✅  Résultats écrits dans {args.output}", file=sys.stderr)
    else:
        print(out)
