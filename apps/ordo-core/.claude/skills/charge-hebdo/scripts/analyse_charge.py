#!/usr/bin/env python3
"""
Analyse de charge par poste de travail sur un horizon S+1 à S+N.

Structure des données attendue :
    data_dir/statique/gammes.csv
    data_dir/dynamique/of_entetes.csv

Usage:
    python3 analyse_charge.py --data-dir data --date-ref 2026-03-24 --horizon 3
    python3 analyse_charge.py --data-dir data --output rapport.json
"""
import argparse
import os
import json
import sys
from datetime import date, timedelta
from collections import defaultdict

import pandas as pd


# ---------------------------------------------------------------------------
# Chemins fichiers
# ---------------------------------------------------------------------------

_STATIQUE  = {'articles', 'gammes', 'nomenclatures'}

def csv_path(data_dir: str, name: str) -> str:
    if name in _STATIQUE:
        return f"{data_dir}/statique/{name}.csv"
    return f"{data_dir}/dynamique/{name}.csv"


def load_csv(path: str) -> pd.DataFrame:
    for enc in ('utf-8-sig', 'latin-1'):
        try:
            df = pd.read_csv(path, sep=';', encoding=enc, decimal=',')
            # Nettoyer les noms de colonnes
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

def analyse_charge(data_dir: str, date_ref: date, horizon: int = 3) -> dict:
    gammes = load_csv(csv_path(data_dir, 'gammes'))
    of_ent = load_csv(csv_path(data_dir, 'of_entetes'))

    # Nettoyage types
    of_ent['DATE_FIN']      = pd.to_datetime(of_ent['DATE_FIN'], dayfirst=True, errors='coerce')
    of_ent['QTE_RESTANTE']  = pd.to_numeric(of_ent['QTE_RESTANTE'], errors='coerce').fillna(0)
    of_ent['STATUT_NUM_OF'] = pd.to_numeric(
        of_ent['STATUT_NUM_OF'].astype(str).str.strip(), errors='coerce'
    ).fillna(0).astype(int)
    gammes['CADENCE'] = pd.to_numeric(gammes['CADENCE'], errors='coerce')

    # Fenêtre temporelle S+1 … S+horizon
    semaines = []
    for i in range(1, horizon + 1):
        lundi, vendredi = week_bounds(date_ref, i)
        semaines.append({'label': f"S+{i}", 'debut': lundi, 'fin': vendredi})

    debut_h = pd.Timestamp(semaines[0]['debut'])
    fin_h   = pd.Timestamp(semaines[-1]['fin'])

    # Filtrer OF pertinents
    mask = (
        of_ent['STATUT_NUM_OF'].isin([1, 3]) &
        (of_ent['DATE_FIN'] >= debut_h) &
        (of_ent['DATE_FIN'] <= fin_h) &
        (of_ent['QTE_RESTANTE'] > 0)
    )
    ofs = of_ent[mask].copy()

    # Index gammes par article
    gammes_idx   = gammes.groupby('ARTICLE')
    charge       = defaultdict(lambda: defaultdict(float))  # poste → label → heures
    poste_libelle= {}
    of_sans_gamme= []

    for _, row in ofs.iterrows():
        article  = str(row['ARTICLE']).strip()
        qte      = float(row['QTE_RESTANTE'])
        date_fin = row['DATE_FIN']

        s_label = next(
            (s['label'] for s in semaines
             if pd.Timestamp(s['debut']) <= date_fin <= pd.Timestamp(s['fin'])),
            None
        )
        if s_label is None:
            continue

        if article not in gammes_idx.groups:
            of_sans_gamme.append({
                'num_of': str(row['NUM_OF']),
                'article': article,
                'qte': qte,
                'date_fin': str(date_fin.date()) if pd.notna(date_fin) else None,
            })
            continue

        for _, g in gammes_idx.get_group(article).iterrows():
            poste   = str(g['POSTE_CHARGE']).strip()
            cadence = g['CADENCE']
            if pd.isna(cadence) or cadence <= 0:
                continue
            libelle = str(g.get('LIBELLE_POSTE', poste)).strip()
            poste_libelle[poste] = libelle
            charge[poste][s_label] += qte / cadence

    # Capacités théoriques (h/semaine, base 5 jours)
    CAP = {'1x8': 40.0, '2x8': 80.0, '3x8': 120.0}

    postes_result = []
    for poste, s_charge in charge.items():
        semaines_data = {}
        max_2x8 = 0.0
        for s in semaines:
            h   = s_charge.get(s['label'], 0.0)
            t2  = round(h / CAP['2x8'] * 100, 1)
            semaines_data[s['label']] = {
                'heures':   round(h, 1),
                'taux_1x8': round(h / CAP['1x8'] * 100, 1),
                'taux_2x8': t2,
                'taux_3x8': round(h / CAP['3x8'] * 100, 1),
            }
            max_2x8 = max(max_2x8, t2)

        statut = ('GOULOT' if max_2x8 > 100 else
                  'TENSION' if max_2x8 > 80 else
                  'OK' if max_2x8 > 0 else 'VIDE')

        postes_result.append({
            'poste':        poste,
            'libelle':      poste_libelle.get(poste, poste),
            'statut':       statut,
            'max_taux_2x8': max_2x8,
            'semaines':     semaines_data,
        })

    # Tri par charge S+1 décroissante
    s1 = semaines[0]['label']
    postes_result.sort(key=lambda p: p['semaines'].get(s1, {}).get('heures', 0), reverse=True)

    # Recommandation
    taux_max_s1 = max((p['semaines'].get(s1, {}).get('taux_2x8', 0) for p in postes_result), default=0.0)
    if taux_max_s1 <= 80:
        reco_org = '1x8';           reco_txt = f"Taux max {s1}={taux_max_s1:.1f}% — 1×8 suffisant"
    elif taux_max_s1 <= 100:
        reco_org = '2x8';           reco_txt = f"Taux max {s1}={taux_max_s1:.1f}% — 2×8 recommandé"
    elif taux_max_s1 <= 130:
        reco_org = '2x8_prioritaire'; reco_txt = f"Taux max {s1}={taux_max_s1:.1f}% — 2×8 obligatoire + priorisation"
    else:
        reco_org = '3x8';           reco_txt = f"Taux max {s1}={taux_max_s1:.1f}% — 3×8 nécessaire"

    return {
        'meta': {
            'date_ref':       str(date_ref),
            'horizon':        horizon,
            'nb_of_total':    len(ofs),
            'nb_of_affermis': int((ofs['STATUT_NUM_OF'] == 1).sum()),
            'nb_of_suggeres': int((ofs['STATUT_NUM_OF'] == 3).sum()),
            'nb_postes':      len(postes_result),
            'semaines': [{'label': s['label'], 'debut': str(s['debut']), 'fin': str(s['fin'])} for s in semaines],
        },
        'postes':      postes_result,
        'goulots':     [p['poste'] for p in postes_result if p['statut'] == 'GOULOT'],
        'tensions':    [p['poste'] for p in postes_result if p['statut'] == 'TENSION'],
        'of_sans_gamme': of_sans_gamme,
        'recommandation': {'organisation': reco_org, 'detail': reco_txt, 'taux_max_s1': taux_max_s1},
        'capacites':   CAP,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Analyse de charge par poste')
    parser.add_argument('--data-dir',  default=os.environ.get('ORDO_EXTRACTIONS_DIR', 'data'))
    parser.add_argument('--date-ref',  default=str(date.today()))
    parser.add_argument('--horizon',   type=int, default=3)
    parser.add_argument('--output',    help='Fichier JSON de sortie')
    args = parser.parse_args()

    result = analyse_charge(args.data_dir, date.fromisoformat(args.date_ref), args.horizon)
    out    = json.dumps(result, ensure_ascii=False, indent=2, default=str)

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(out)
        print(f"✅  Résultats écrits dans {args.output}", file=sys.stderr)
    else:
        print(out)
