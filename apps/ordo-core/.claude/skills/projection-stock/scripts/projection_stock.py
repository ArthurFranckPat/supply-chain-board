#!/usr/bin/env python3
"""
Projection du stock article par article sur un horizon S+1 à S+N.

Structure des données :
    data_dir/statique/nomenclatures.csv, articles.csv
    data_dir/dynamique/stock.csv, receptions_oa.csv, of_entetes.csv, besoins_clients.csv

Usage:
    python3 projection_stock.py --data-dir data --horizon 4
    python3 projection_stock.py --data-dir data --article E7368
    python3 projection_stock.py --data-dir data --output projection.json
"""
import argparse
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


def to_label(ts, semaines: list):
    if pd.isna(ts):
        return None
    for s in semaines:
        if pd.Timestamp(s['debut']) <= ts <= pd.Timestamp(s['fin']):
            return s['label']
    return None


def build_nomenclature_index(df: pd.DataFrame) -> dict:
    cols = df.columns.tolist()
    def find(kw): return next((c for c in cols if kw.lower() in c.lower()), cols[0])
    col_parent    = find('parent')
    col_composant = find('composant')
    col_qte       = find('qt')
    col_type      = find('type')

    idx = defaultdict(list)
    for _, row in df.iterrows():
        parent    = str(row[col_parent]).strip()
        composant = str(row[col_composant]).strip()
        try:
            qte = float(str(row[col_qte]).replace(',', '.').replace(' ', ''))
        except (ValueError, TypeError):
            qte = 1.0
        type_art = str(row[col_type]).strip() if col_type else 'Acheté'
        idx[parent].append({'article': composant, 'qte_lien': qte, 'type': type_art})
    return dict(idx)


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------

def projeter_stock(data_dir: str, date_ref: date, horizon: int = 4,
                   article_filter: str = None, seuil_semaines: float = 1.0) -> dict:

    # Chargement
    stock_df  = load_csv(csv_path(data_dir, 'stock'))
    rec_df    = load_csv(csv_path(data_dir, 'receptions_oa'))
    of_df     = load_csv(csv_path(data_dir, 'of_entetes'))
    cmd_df    = load_csv(csv_path(data_dir, 'besoins_clients'))
    nom_df    = load_csv(csv_path(data_dir, 'nomenclatures'))

    rec_df['DATE_RECEPTION_PREVUE']       = pd.to_datetime(rec_df['DATE_RECEPTION_PREVUE'],       dayfirst=True, errors='coerce')
    of_df['DATE_FIN']                     = pd.to_datetime(of_df['DATE_FIN'],                     dayfirst=True, errors='coerce')
    cmd_df['DATE_EXPEDITION_DEMANDEE']    = pd.to_datetime(cmd_df['DATE_EXPEDITION_DEMANDEE'],    dayfirst=True, errors='coerce')

    of_df['QTE_RESTANTE']  = pd.to_numeric(of_df['QTE_RESTANTE'],  errors='coerce').fillna(0)
    cmd_df['QTE_RESTANTE'] = pd.to_numeric(cmd_df['QTE_RESTANTE'], errors='coerce').fillna(0)
    rec_df['QUANTITE_RESTANTE'] = pd.to_numeric(rec_df['QUANTITE_RESTANTE'], errors='coerce').fillna(0)
    of_df['STATUT_NUM_OF'] = pd.to_numeric(
        of_df['STATUT_NUM_OF'].astype(str).str.strip(), errors='coerce').fillna(0).astype(int)

    for col in ('STOCK_PHYSIQUE', 'STOCK_ALLOUE', 'STOCK_BLOQUE'):
        stock_df[col] = pd.to_numeric(stock_df[col], errors='coerce').fillna(0)

    nom_idx = build_nomenclature_index(nom_df)

    # Semaines
    semaines = [{'label': f"S+{i}", **{'debut': week_bounds(date_ref, i)[0], 'fin': week_bounds(date_ref, i)[1]}}
                for i in range(1, horizon + 1)]
    labels   = [s['label'] for s in semaines]

    # Stock initial
    stock_init: dict[str, float] = {}
    for _, row in stock_df.iterrows():
        art = str(row['ARTICLE']).strip()
        stock_init[art] = max(0.0, float(row['STOCK_PHYSIQUE']) - float(row['STOCK_ALLOUE']) - float(row['STOCK_BLOQUE']))

    # Flux
    entrees: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    sorties: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))

    # + Réceptions fournisseurs
    for _, row in rec_df.iterrows():
        lbl = to_label(row['DATE_RECEPTION_PREVUE'], semaines)
        if lbl:
            entrees[str(row['ARTICLE']).strip()][lbl] += float(row['QUANTITE_RESTANTE'])

    # + Productions OF (articles finis)
    active_ofs = of_df[of_df['STATUT_NUM_OF'].isin([1, 3]) & (of_df['QTE_RESTANTE'] > 0)]
    for _, row in active_ofs.iterrows():
        lbl = to_label(row['DATE_FIN'], semaines)
        if lbl:
            entrees[str(row['ARTICLE']).strip()][lbl] += float(row['QTE_RESTANTE'])

    # - Besoins commandes clients
    for _, row in cmd_df[cmd_df['QTE_RESTANTE'] > 0].iterrows():
        lbl = to_label(row['DATE_EXPEDITION_DEMANDEE'], semaines)
        if lbl:
            sorties[str(row['ARTICLE']).strip()][lbl] += float(row['QTE_RESTANTE'])

    # - Consommation composants achetés pour les OF
    for _, row in active_ofs.iterrows():
        if pd.isna(row['DATE_FIN']):
            continue
        art_of  = str(row['ARTICLE']).strip()
        qte_of  = float(row['QTE_RESTANTE'])
        # Besoin composants la semaine précédant la fin de l'OF
        date_besoin = row['DATE_FIN'] - pd.Timedelta(weeks=1)
        lbl = to_label(date_besoin, semaines) or to_label(row['DATE_FIN'], semaines)
        if not lbl:
            continue
        for comp in nom_idx.get(art_of, []):
            if 'achet' in comp['type'].lower():
                sorties[comp['article']][lbl] += comp['qte_lien'] * qte_of

    # Tous les articles avec mouvement
    tous = set(stock_init) | set(entrees) | set(sorties)
    if article_filter:
        tous = {a for a in tous if a == article_filter.strip()}

    # Projection semaine par semaine
    proj_list = []
    for art in sorted(tous):
        s_courant      = stock_init.get(art, 0.0)
        detail         = {}
        rupture_sem    = None

        for s in semaines:
            lbl    = s['label']
            e      = entrees[art].get(lbl, 0.0)
            so     = sorties[art].get(lbl, 0.0)
            s_fin  = s_courant + e - so
            detail[lbl] = {
                'stock_debut': round(s_courant, 3),
                'entrees':     round(e, 3),
                'sorties':     round(so, 3),
                'stock_fin':   round(s_fin, 3),
            }
            if s_fin < 0 and rupture_sem is None:
                rupture_sem = lbl
            s_courant = s_fin

        total_sorties = sum(sorties[art].get(l, 0) for l in labels)
        cmj_hebdo     = total_sorties / horizon if horizon > 0 else 0
        couverture    = (stock_init.get(art, 0) / cmj_hebdo) if cmj_hebdo > 0 else None

        statut = ('RUPTURE' if rupture_sem else
                  'TENSION' if couverture is not None and couverture < seuil_semaines else
                  'OK'      if total_sorties > 0 else 'STABLE')

        proj_list.append({
            'article':             art,
            'stock_initial':       round(stock_init.get(art, 0.0), 3),
            'statut':              statut,
            'rupture_semaine':     rupture_sem,
            'couverture_semaines': round(couverture, 1) if couverture is not None else None,
            'total_entrees':       round(sum(entrees[art].get(l, 0) for l in labels), 3),
            'total_sorties':       round(total_sorties, 3),
            'semaines':            detail,
        })

    ordre = {'RUPTURE': 0, 'TENSION': 1, 'OK': 2, 'STABLE': 3}
    proj_list.sort(key=lambda p: (ordre.get(p['statut'], 9), p['rupture_semaine'] or 'ZZZ'))

    ruptures = [p for p in proj_list if p['statut'] == 'RUPTURE']
    tensions = [p for p in proj_list if p['statut'] == 'TENSION']

    return {
        'meta': {
            'date_ref': str(date_ref), 'horizon': horizon,
            'seuil_alerte_sem': seuil_semaines,
            'nb_articles': len(proj_list),
            'semaines': [{'label': s['label'], 'debut': str(s['debut']), 'fin': str(s['fin'])} for s in semaines],
        },
        'resume': {
            'nb_ruptures': len(ruptures), 'nb_tensions': len(tensions),
            'nb_ok': sum(1 for p in proj_list if p['statut'] in ('OK', 'STABLE')),
            'articles_rupture': [p['article'] for p in ruptures],
            'articles_tension': [p['article'] for p in tensions],
        },
        'projections': proj_list,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Projection stock sur horizon')
    parser.add_argument('--data-dir',     default='data')
    parser.add_argument('--date-ref',     default=str(date.today()))
    parser.add_argument('--horizon',      type=int,   default=4)
    parser.add_argument('--article',                  help='Filtrer sur un article')
    parser.add_argument('--seuil-alerte', type=float, default=1.0)
    parser.add_argument('--output',                   help='Fichier JSON de sortie')
    args = parser.parse_args()

    result = projeter_stock(args.data_dir, date.fromisoformat(args.date_ref),
                            args.horizon, args.article, args.seuil_alerte)

    out = json.dumps(result, ensure_ascii=False, indent=2, default=str)
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(out)
        print(f"✅  Résultats écrits dans {args.output}", file=sys.stderr)
    else:
        print(out)
