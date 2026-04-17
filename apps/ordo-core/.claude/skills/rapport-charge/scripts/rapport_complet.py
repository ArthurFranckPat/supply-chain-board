#!/usr/bin/env python3
"""
Rapport hebdomadaire complet de charge pour la réunion du mardi.

Orchestre les 4 analyses :
  1. analyse_charge     -> charge par poste S+1/S+N
  2. verif_faisabilite  -> OF faisables vs bloques (tous les OF actifs)
  3. matching           -> couverture commandes NOR/MTO
  4. projection_stock   -> articles en tension / rupture

Usage:
    python3 rapport_complet.py --data-dir data --date-ref 2026-03-24
    python3 rapport_complet.py --data-dir data --output rapport.json
"""
import argparse
import os
import importlib.util
import json
import sys
from datetime import date, timedelta
from pathlib import Path

_HERE = Path(__file__).parent

_SCRIPTS = {
    'charge':      _HERE.parent.parent / 'charge-hebdo'       / 'scripts' / 'analyse_charge.py',
    'faisabilite': _HERE.parent.parent / 'faisabilite-of'     / 'scripts' / 'verif_faisabilite.py',
    'matching':    _HERE.parent.parent / 'matching-commandes' / 'scripts' / 'matching.py',
    'projection':  _HERE.parent.parent / 'projection-stock'   / 'scripts' / 'projection_stock.py',
}


# ---------------------------------------------------------------------------
# Import dynamique
# ---------------------------------------------------------------------------

def _load_module(name: str):
    path = _SCRIPTS[name]
    spec = importlib.util.spec_from_file_location(path.stem, path)
    mod  = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _safe_call(label: str, fn):
    """Appelle fn() et retourne (result, error_str) sans lever d'exception."""
    try:
        return fn(), None
    except Exception as e:
        print(f"  [{label}] {type(e).__name__}: {e}", file=sys.stderr)
        return None, f"{type(e).__name__}: {e}"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _week_bounds(ref: date, offset: int):
    monday = ref - timedelta(days=ref.weekday())
    m = monday + timedelta(weeks=offset)
    return m, m + timedelta(days=4)


# ---------------------------------------------------------------------------
# Rapport principal
# ---------------------------------------------------------------------------

def generer_rapport(data_dir: str, date_ref: date, horizon: int = 3) -> dict:
    # 1. Charger les modules
    mods = {}
    for name in _SCRIPTS:
        try:
            mods[name] = _load_module(name)
        except Exception as e:
            print(f"  [load:{name}] {e}", file=sys.stderr)

    # 2. Executer les 4 analyses
    def run_charge():
        return mods['charge'].analyse_charge(data_dir, date_ref, horizon)

    def run_faisabilite():
        return mods['faisabilite'].verifier_faisabilite(data_dir, None, 'projete')

    def run_matching():
        return mods['matching'].run_matching(data_dir, date_ref, horizon, ['MTO', 'NOR'])

    def run_projection():
        return mods['projection'].projeter_stock(data_dir, date_ref, horizon)

    r_charge,     e_charge     = _safe_call('charge-hebdo',      run_charge      if 'charge'      in mods else lambda: (_ for _ in ()).throw(RuntimeError('module non disponible')))
    r_faisab,     e_faisab     = _safe_call('faisabilite-of',    run_faisabilite if 'faisabilite' in mods else lambda: (_ for _ in ()).throw(RuntimeError('module non disponible')))
    r_matching,   e_matching   = _safe_call('matching-commandes',run_matching    if 'matching'    in mods else lambda: (_ for _ in ()).throw(RuntimeError('module non disponible')))
    r_projection, e_projection = _safe_call('projection-stock',  run_projection  if 'projection'  in mods else lambda: (_ for _ in ()).throw(RuntimeError('module non disponible')))

    # 3. Filtrer faisabilite sur S+1
    r_faisab_s1 = None
    if r_faisab:
        lundi_s1, vendredi_s1 = _week_bounds(date_ref, 1)
        r_faisab_s1 = {
            **r_faisab,
            'resultats': [
                r for r in r_faisab['resultats']
                if r.get('date_fin') and str(lundi_s1) <= r['date_fin'] <= str(vendredi_s1)
            ]
        }

    # 4. Construire les blocs
    erreurs = {k: v for k, v in {
        'charge': e_charge, 'faisabilite': e_faisab,
        'matching': e_matching, 'projection': e_projection,
    }.items() if v}

    bloc_charge = {'disponible': r_charge is not None, 'erreur': e_charge, 'data': r_charge}

    bloc_faisab = {'disponible': r_faisab_s1 is not None, 'erreur': e_faisab}
    if r_faisab_s1:
        bloc_faisab.update({
            'of_faisables': [r for r in r_faisab_s1['resultats'] if r['statut'] == 'FAISABLE'],
            'of_bloques':   [r for r in r_faisab_s1['resultats'] if r['statut'] in ('BLOQUE', 'PARTIEL')],
            'of_alertes':   [r for r in r_faisab_s1['resultats'] if r['statut'] == 'ALERTE'],
            'stats':        r_faisab_s1.get('meta', {}).get('stats', {}),
        })

    bloc_stock = {'disponible': r_projection is not None, 'erreur': e_projection}
    if r_projection:
        bloc_stock.update({
            'ruptures': [p for p in r_projection['projections'] if p['statut'] == 'RUPTURE'],
            'tensions': [p for p in r_projection['projections'] if p['statut'] == 'TENSION'],
            'resume':   r_projection.get('resume', {}),
        })

    bloc_matching = {'disponible': r_matching is not None, 'erreur': e_matching}
    if r_matching:
        bloc_matching.update({
            'stats':         r_matching.get('stats', {}),
            'non_couvertes': [r for r in r_matching['resultats'] if r['statut'] in ('NON_COUVERT', 'BESOIN_APPRO')],
            'partielles':    [r for r in r_matching['resultats'] if r['statut'] == 'PARTIEL'],
            'of_partages':   r_matching.get('of_partages', []),
        })

    dashboard = _build_dashboard(r_charge, r_faisab_s1, r_matching, r_projection)
    actions   = _build_actions(bloc_faisab, bloc_stock, bloc_matching, bloc_charge)

    return {
        'meta': {
            'date_ref':  str(date_ref),
            'horizon':   horizon,
            'semaine_s1': str(_week_bounds(date_ref, 1)[0]),
            'erreurs':   erreurs,
            'blocs_ok':  [k for k in ['charge', 'faisabilite', 'matching', 'projection'] if k not in erreurs],
        },
        'dashboard':     dashboard,
        'bloc_charge':   bloc_charge,
        'bloc_faisab':   bloc_faisab,
        'bloc_stock':    bloc_stock,
        'bloc_matching': bloc_matching,
        'actions':       actions,
    }


def _build_dashboard(r_charge, r_faisab, r_matching, r_projection) -> dict:
    d = {}
    if r_charge:
        reco = r_charge.get('recommandation', {})
        d.update({'organisation_recommandee': reco.get('organisation'),
                  'taux_charge_max_s1': reco.get('taux_max_s1'),
                  'nb_goulots':   len(r_charge.get('goulots', [])),
                  'nb_of_semaine': r_charge.get('meta', {}).get('nb_of_total', 0)})
    if r_faisab:
        stats = r_faisab.get('meta', {}).get('stats', {})
        d.update({'of_bloques_s1':   stats.get('bloque', 0) + stats.get('partiel', 0),
                  'of_faisables_s1': stats.get('faisable', 0)})
    if r_matching:
        stats = r_matching.get('stats', {})
        d.update({'taux_service_pct':       stats.get('taux_service_pct', 0),
                  'commandes_non_couvertes': stats.get('non_couvert', 0) + stats.get('besoin_appro', 0)})
    if r_projection:
        resume = r_projection.get('resume', {})
        d.update({'articles_en_rupture': resume.get('nb_ruptures', 0),
                  'articles_en_tension': resume.get('nb_tensions', 0)})
    return d


def _build_actions(bloc_faisab, bloc_stock, bloc_matching, bloc_charge) -> dict:
    immediates, reunions, validations = [], [], []

    if bloc_faisab.get('disponible'):
        for of in bloc_faisab.get('of_bloques', []):
            for m in of.get('composants_manquants', [])[:2]:
                immediates.append(
                    f"Appro {m.get('article','?')} ({m.get('manque','?')} u) — bloque OF {of['num_of']}")
        for of in bloc_faisab.get('of_alertes', []):
            immediates.append(f"Verifier nomenclature OF {of['num_of']} ({of['article']}) avec le BE")

    if bloc_stock.get('disponible'):
        for p in bloc_stock.get('ruptures', [])[:3]:
            immediates.append(f"Stock {p['article']} : rupture prevue {p['rupture_semaine']} — appro urgente")

    if bloc_charge.get('disponible') and bloc_charge.get('data'):
        reco = bloc_charge['data'].get('recommandation', {})
        org  = reco.get('organisation', '')
        if org in ('2x8', '2x8_prioritaire', '3x8'):
            goulots = bloc_charge['data'].get('goulots', [])
            reunions.append(
                f"Organisation S+1 : {org} recommande"
                + (f" (goulots : {', '.join(goulots)})" if goulots else ''))

    if bloc_matching.get('disponible'):
        for cmd in bloc_matching.get('non_couvertes', [])[:3]:
            reunions.append(
                f"Commande {cmd['num_commande']} ({cmd['client']}, {cmd['article']}, "
                f"{cmd['qte_manquante']} u) — non couverte pour le {cmd['date_exp']}")

    if bloc_faisab.get('disponible'):
        for of in bloc_faisab.get('of_faisables', [])[:5]:
            validations.append(
                f"Affermir OF {of['num_of']} ({of['article']}, {of['qte']} u) — composants OK")

    return {
        'immediates':  immediates,
        'reunions':    reunions,
        'validations': validations,
        'nb_total':    len(immediates) + len(reunions) + len(validations),
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Rapport complet de charge hebdomadaire')
    parser.add_argument('--data-dir', default=os.environ.get('ORDO_EXTRACTIONS_DIR', 'data'))
    parser.add_argument('--date-ref', default=str(date.today()))
    parser.add_argument('--horizon',  type=int, default=3)
    parser.add_argument('--output',   help='Fichier JSON de sortie')
    args = parser.parse_args()

    result = generer_rapport(args.data_dir, date.fromisoformat(args.date_ref), args.horizon)
    out    = json.dumps(result, ensure_ascii=False, indent=2, default=str)

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(out)
        print(f"  Rapport ecrit dans {args.output}", file=sys.stderr)
    else:
        print(out)
