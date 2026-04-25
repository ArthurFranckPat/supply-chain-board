#!/usr/bin/env python3
"""
Vérification récursive de la faisabilité des OF par analyse des composants.

Structure des données :
    data_dir/statique/nomenclatures.csv, articles.csv
    data_dir/dynamique/of_entetes.csv, stock.csv, receptions_oa.csv

Usage:
    python3 verif_faisabilite.py --data-dir data --of F426-08419,F426-08164
    python3 verif_faisabilite.py --data-dir data --mode immediat
"""
import argparse
import os
import json
import sys
from collections import defaultdict

import pandas as pd


MAX_DEPTH = 10

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
# Chargement données
# ---------------------------------------------------------------------------

def load_all(data_dir: str) -> dict:
    dfs = {name: load_csv(csv_path(data_dir, name))
           for name in ['nomenclatures', 'stock', 'receptions_oa', 'articles', 'of_entetes']}

    dfs['receptions_oa']['DATE_RECEPTION_PREVUE'] = pd.to_datetime(
        dfs['receptions_oa']['DATE_RECEPTION_PREVUE'], dayfirst=True, errors='coerce')
    dfs['of_entetes']['DATE_FIN'] = pd.to_datetime(
        dfs['of_entetes']['DATE_FIN'], dayfirst=True, errors='coerce')
    dfs['of_entetes']['QTE_RESTANTE'] = pd.to_numeric(
        dfs['of_entetes']['QTE_RESTANTE'], errors='coerce').fillna(0)
    dfs['of_entetes']['STATUT_NUM_OF'] = pd.to_numeric(
        dfs['of_entetes']['STATUT_NUM_OF'].astype(str).str.strip(), errors='coerce'
    ).fillna(0).astype(int)

    return dfs


def build_stock_index(df: pd.DataFrame) -> dict:
    idx = {}
    for _, row in df.iterrows():
        art = str(row['ARTICLE']).strip()
        idx[art] = max(0.0,
            float(row.get('STOCK_PHYSIQUE', 0) or 0) -
            float(row.get('STOCK_ALLOUE',   0) or 0) -
            float(row.get('STOCK_BLOQUE',   0) or 0))
    return idx


def build_receptions_index(df: pd.DataFrame) -> dict:
    idx = defaultdict(list)
    for _, row in df.iterrows():
        if pd.notna(row['DATE_RECEPTION_PREVUE']) and pd.notna(row['QUANTITE_RESTANTE']):
            idx[str(row['ARTICLE']).strip()].append(
                (row['DATE_RECEPTION_PREVUE'], float(row['QUANTITE_RESTANTE'])))
    return dict(idx)


def build_nomenclature_index(df: pd.DataFrame) -> dict:
    cols = df.columns.tolist()

    def find(kw):
        return next((c for c in cols if kw.lower() in c.lower()), cols[0])

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


def build_articles_index(df: pd.DataFrame) -> dict:
    return {str(r['ARTICLE']).strip(): str(r.get('TYPE_APPRO', 'ACHAT')).strip()
            for _, r in df.iterrows()}


# ---------------------------------------------------------------------------
# Logique de vérification
# ---------------------------------------------------------------------------

def is_achat(type_str: str, article: str, art_idx: dict) -> bool:
    # "Acheté", "Achet\xe9", "ACHAT" → tous détectés
    t = type_str.lower()
    return 'achet' in t or art_idx.get(article, 'ACHAT').upper() == 'ACHAT'


def stock_dispo(article: str, date_besoin, stock_virt: dict,
                rec_idx: dict, mode: str) -> float:
    base = stock_virt.get(article, 0.0)
    if mode == 'projete' and date_besoin is not None:
        for d_rec, qte in rec_idx.get(article, []):
            if pd.notna(d_rec) and d_rec <= pd.Timestamp(date_besoin):
                base += qte
    return base


def verifier_composants(article: str, qte_besoin: float, date_besoin,
                         stock_virt: dict, nom_idx: dict, rec_idx: dict,
                         art_idx: dict, mode: str, depth: int = 0) -> dict:
    if depth >= MAX_DEPTH:
        return {'statut': 'ALERTE', 'manquants': [
            {'article': article, 'message': f'Récursion max ({depth})'}]}

    dispo = stock_dispo(article, date_besoin, stock_virt, rec_idx, mode)

    if dispo >= qte_besoin:
        stock_virt[article] = max(0.0, dispo - qte_besoin)
        return {'statut': 'FAISABLE', 'manquants': []}

    type_appro = art_idx.get(article, 'ACHAT').upper()

    if type_appro == 'ACHAT':
        recs = [(str(d.date()), q) for d, q in rec_idx.get(article, []) if pd.notna(d)]
        return {'statut': 'BLOQUÉ', 'manquants': [{
            'article': article, 'type': 'ACHAT',
            'besoin': round(qte_besoin, 4), 'dispo': round(dispo, 4),
            'manque': round(qte_besoin - max(0.0, dispo), 4),
            'receptions': recs[:5],
        }]}

    composants = nom_idx.get(article, [])
    if not composants:
        return {'statut': 'ALERTE', 'manquants': [{
            'article': article, 'type': 'FABRICATION',
            'message': 'Nomenclature non disponible',
            'besoin': round(qte_besoin, 4),
        }]}

    if dispo > 0:
        stock_virt[article] = 0.0
    a_fabriquer = qte_besoin - max(0.0, dispo)

    manquants = []
    for comp in composants:
        comp_art    = comp['article']
        comp_besoin = comp['qte_lien'] * a_fabriquer
        if is_achat(comp['type'], comp_art, art_idx):
            comp_dispo = stock_dispo(comp_art, date_besoin, stock_virt, rec_idx, mode)
            if comp_dispo >= comp_besoin:
                stock_virt[comp_art] = max(0.0, comp_dispo - comp_besoin)
            else:
                recs = [(str(d.date()), q) for d, q in rec_idx.get(comp_art, []) if pd.notna(d)]
                manquants.append({
                    'article': comp_art, 'type': 'ACHAT',
                    'besoin': round(comp_besoin, 4), 'dispo': round(comp_dispo, 4),
                    'manque': round(comp_besoin - max(0.0, comp_dispo), 4),
                    'receptions': recs[:5],
                })
        else:
            sub = verifier_composants(comp_art, comp_besoin, date_besoin,
                                       stock_virt, nom_idx, rec_idx, art_idx, mode, depth + 1)
            manquants.extend(sub['manquants'])

    return {'statut': 'BLOQUÉ' if manquants else 'FAISABLE', 'manquants': manquants}


def verifier_of(row: pd.Series, stock_virt: dict, nom_idx: dict,
                rec_idx: dict, art_idx: dict, mode: str) -> dict:
    num_of   = str(row['NUM_OF']).strip()
    article  = str(row['ARTICLE']).strip()
    qte      = float(row['QTE_RESTANTE'])
    date_fin = row['DATE_FIN'] if pd.notna(row['DATE_FIN']) else None
    statut_of= int(row['STATUT_NUM_OF'])

    composants = nom_idx.get(article)
    if composants is None:
        return {
            'num_of': num_of, 'article': article, 'qte': qte,
            'date_fin': str(date_fin.date()) if date_fin else None,
            'statut_of': statut_of, 'statut': 'ALERTE',
            'message': 'Nomenclature non disponible',
            'composants_manquants': [], 'composants_ok': [],
        }

    manquants, ok_list = [], []

    for comp in composants:
        comp_art    = comp['article']
        comp_besoin = comp['qte_lien'] * qte
        if is_achat(comp['type'], comp_art, art_idx):
            dispo = stock_dispo(comp_art, date_fin, stock_virt, rec_idx, mode)
            if dispo >= comp_besoin:
                stock_virt[comp_art] = max(0.0, dispo - comp_besoin)
                ok_list.append({'article': comp_art, 'type': 'ACHAT',
                                'besoin': round(comp_besoin, 4), 'dispo': round(dispo, 4)})
            else:
                recs = [(str(d.date()), q) for d, q in rec_idx.get(comp_art, []) if pd.notna(d)]
                manquants.append({
                    'article': comp_art, 'type': 'ACHAT',
                    'besoin': round(comp_besoin, 4), 'dispo': round(dispo, 4),
                    'manque': round(comp_besoin - max(0.0, dispo), 4),
                    'receptions': recs[:5],
                })
        else:
            sub = verifier_composants(comp_art, comp_besoin, date_fin,
                                       stock_virt, nom_idx, rec_idx, art_idx, mode)
            if sub['statut'] == 'FAISABLE':
                ok_list.append({'article': comp_art, 'type': 'FABRICATION',
                                'besoin': round(comp_besoin, 4), 'statut': 'OK'})
            else:
                manquants.extend(sub['manquants'])

    statut = 'FAISABLE' if not manquants else ('PARTIEL' if ok_list else 'BLOQUÉ')
    return {
        'num_of': num_of, 'article': article, 'qte': qte,
        'date_fin': str(date_fin.date()) if date_fin else None,
        'statut_of': statut_of, 'statut': statut,
        'composants_manquants': manquants,
        'composants_ok': ok_list,
        'nb_manquants': len(manquants), 'nb_ok': len(ok_list),
    }


# ---------------------------------------------------------------------------
# Point d'entrée
# ---------------------------------------------------------------------------

def verifier_faisabilite(data_dir: str, of_list: list = None, mode: str = 'projete') -> dict:
    dfs       = load_all(data_dir)
    stock_virt= build_stock_index(dfs['stock'])
    rec_idx   = build_receptions_index(dfs['receptions_oa'])
    nom_idx   = build_nomenclature_index(dfs['nomenclatures'])
    art_idx   = build_articles_index(dfs['articles'])
    of_ent    = dfs['of_entetes']

    if of_list:
        ofs = of_ent[of_ent['NUM_OF'].astype(str).isin(of_list)].copy()
    else:
        ofs = of_ent[of_ent['QTE_RESTANTE'] > 0].copy()

    ofs = ofs.sort_values('DATE_FIN', na_position='last')

    results = [verifier_of(row, stock_virt, nom_idx, rec_idx, art_idx, mode)
               for _, row in ofs.iterrows()]

    stats = {k: sum(1 for r in results if r['statut'] == v)
             for k, v in [('faisable','FAISABLE'),('partiel','PARTIEL'),
                          ('bloque','BLOQUÉ'),('alerte','ALERTE')]}
    stats['total'] = len(results)

    return {
        'meta': {'mode': mode, 'nb_of_verifies': len(results), 'stats': stats},
        'resultats': results,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Vérification faisabilité OF')
    parser.add_argument('--data-dir', default=os.environ.get('ORDO_EXTRACTIONS_DIR', 'data'))
    parser.add_argument('--of',   help='Numéros OF séparés par virgule')
    parser.add_argument('--mode', choices=['immediat', 'projete'], default='projete')
    parser.add_argument('--output', help='Fichier JSON de sortie')
    args = parser.parse_args()

    of_list = [o.strip() for o in args.of.split(',')] if args.of else None
    result  = verifier_faisabilite(args.data_dir, of_list, args.mode)

    out = json.dumps(result, ensure_ascii=False, indent=2, default=str)
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(out)
        print(f"✅  Résultats écrits dans {args.output}", file=sys.stderr)
    else:
        print(out)
