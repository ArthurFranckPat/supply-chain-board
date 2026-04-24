#!/usr/bin/env python3
"""Analyse de charge par poste de charge ou article.

Usage:
    # Analyse d'un poste de charge (PP_830) sur S+1
    python analyze_charge.py --poste PP_830 --semaine S+1

    # Analyse d'un poste sur plusieurs semaines
    python analyze_charge.py --poste PP_830 --semaine all --horizon 4

    # Analyse d'un article
    python analyze_charge.py --article 11035404 --semaine S+1

    # Liste tous les postes de charge
    python analyze_charge.py --list-postes
"""

import sys
import argparse
from pathlib import Path
from datetime import date, timedelta
from collections import defaultdict

project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from src.loaders.data_loader import DataLoader
from src.planning.charge_calculator import calculate_article_charge, get_week_info
from src.orders.forecast_consumption import consume_forecasts_by_article, format_consumption_stats


def is_valid_poste(poste: str) -> bool:
    """Vérifie si un poste suit le pattern PP_xxx."""
    import re
    return bool(re.match(r"^PP_\d+$", poste))


def list_postes(loader):
    """Liste tous les postes de charge disponibles."""
    postes = set()
    for article, gamme in loader.gammes.items():
        for op in gamme.operations:
            if is_valid_poste(op.poste_charge):
                postes.add(op.poste_charge)

    print("📋 Postes de charge disponibles :")
    print(f"   {len(postes)} postes trouvés\n")

    for poste in sorted(postes):
        # Trouver un libellé
        libelle = ""
        for gamme in loader.gammes.values():
            for op in gamme.operations:
                if op.poste_charge == poste:
                    libelle = op.libelle_poste
                    break
            if libelle:
                break

        print(f"   {poste:15s} - {libelle[:50] if libelle else ''}")


def analyze_poste(poste, semaine, horizon, loader, date_ref, args=None):
    """Analyse la charge d'un poste de charge."""
    print(f"\n{'='*100}")
    print(f"ANALYSE DE CHARGE : {poste}")
    print(f"{'='*100}\n")

    horizon_days = horizon * 7
    besoins_futurs = [
        b for b in loader.commandes_clients
        if b.qte_restante > 0
        and 0 < (b.date_expedition_demandee - date_ref).days <= horizon_days
    ]

    print(f"📅 Date de référence : {date_ref}")
    print(f"📊 Horizon : {horizon} semaines ({horizon_days} jours)")
    print(f"📋 Besoins analysés : {len(besoins_futurs)}\n")

    if semaine == "all":
        # Toutes les semaines
        semaines = [f"S+{i}" for i in range(1, horizon + 1)]
    else:
        semaines = [semaine]

    total_general = 0
    total_besoins = 0

    for week_label in semaines:
        week_num = int(week_label.replace("S+", ""))

        # Calculer les bornes de la semaine
        start_date = date_ref + timedelta(days=(week_num-1)*7)
        end_date = start_date + timedelta(days=6)

        # 1. Regrouper les besoins de la semaine
        besoins_semaine = [
            b for b in besoins_futurs
            if get_week_info(b.date_expedition_demandee, date_ref)["week_label"] == week_label
        ]

        # 2. Calculer les stats brutes avant consommation (uniquement les prévisions pour ce poste)
        prev_brut_v = 0
        prev_brut_h = 0
        for b in besoins_semaine:
            if b.nature_besoin.value == "PREVISION":
                charge = calculate_article_charge(b.article, b.qte_restante, loader)
                if poste in charge and charge[poste] > 0:
                    prev_brut_v += b.qte_restante
                    prev_brut_h += charge[poste]

        # 3. Appliquer la consommation des prévisions
        besoins_ajustes, stats_consumption = consume_forecasts_by_article(
            besoins_semaine,
            week_label
        )

        # 4. Calculer la charge sur les besoins ajustés
        weekly_results = []

        for besoin in besoins_ajustes:
            # Calculer la charge
            charge = calculate_article_charge(
                article=besoin.article,
                quantity=besoin.qte_restante,
                data_loader=loader
            )

            if poste in charge and charge[poste] > 0:
                total_besoins += 1
                weekly_results.append({
                    "article": besoin.article,
                    "client": besoin.nom_client,
                    "type": besoin.type_commande,
                    "nature": besoin.nature_besoin,
                    "qte": besoin.qte_restante,
                    "date_exp": besoin.date_expedition_demandee,
                    "charge": charge[poste]
                })

        if weekly_results:
            total_week = sum(r["charge"] for r in weekly_results)
            total_general += total_week

            # Calculer la répartition commandes vs prévisions (heures ET volumes)
            total_commandes_h = sum(r["charge"] for r in weekly_results if r["nature"].value == "COMMANDE")
            total_commandes_v = sum(r["qte"] for r in weekly_results if r["nature"].value == "COMMANDE")
            total_previsions_h = sum(r["charge"] for r in weekly_results if r["nature"].value == "PREVISION")
            total_previsions_v = sum(r["qte"] for r in weekly_results if r["nature"].value == "PREVISION")

            # Calculer les prévisions brutes (avant consommation)
            prev_brut_h = sum(
                sum(charge.get(poste, 0) for charge in
                    [calculate_article_charge(b.article, b.qte_restante, loader)
                     for b in besoins_semaine if b.nature_besoin.value == "PREVISION" and b.article == art])
                for art in stats_consumption.keys()
            )

            print(f"📅 {week_label} ({start_date} → {end_date})")
            print(f"   Total: {total_week:.2f}h")
            print(f"   Commandes: {total_commandes_h:.2f}h ({total_commandes_h/total_week*100:.1f}%) - {total_commandes_v} pièces")
            print(f"   Prévisions brutes: {prev_brut_h:.2f}h - {prev_brut_v} pièces")
            print(f"   Prévisions nettes: {total_previsions_h:.2f}h ({total_previsions_h/total_week*100:.1f}%) - {total_previsions_v} pièces")
            print(f"   Nombre de besoins: {len(weekly_results)}")

            # Afficher le détail de la consommation si demandé
            if args and getattr(args, 'show_consumption', False) and stats_consumption:
                print(f"\n   📊 CONSOMMATION PAR ARTICLE :")
                for article_line in format_consumption_stats(stats_consumption).split("\n"):
                    print(f"      {article_line}")
                print()

            else:
                print()

            # Si demandé, afficher uniquement les prévisions
            if args and getattr(args, 'only_previsions', False):
                prev_results = [r for r in weekly_results if r["nature"].value == "PREVISION"]
                if prev_results:
                    # Regrouper par article
                    from collections import defaultdict
                    grouped = defaultdict(lambda: {"qte": 0, "charge": 0, "type": None, "lignes": []})

                    for r in prev_results:
                        grouped[r['article']]["qte"] += r['qte']
                        grouped[r['article']]["charge"] += r['charge']
                        grouped[r['article']]["type"] = r['type']
                        grouped[r['article']]["lignes"].append(r)

                    print(f"   📋 DÉTAIL DES PRÉVISIONS GROUPÉES PAR ARTICLE :\n")
                    sorted_articles = sorted(grouped.items(), key=lambda x: x[0])

                    total_qte = 0
                    for i, (article, data) in enumerate(sorted_articles, 1):
                        total_qte += data["qte"]
                        print(f"   [{i}] {article}")
                        print(f"       Type: {data['type']}")
                        print(f"       Qté totale: {data['qte']:,} pièces".replace(",", " "))
                        print(f"       Charge totale: {data['charge']:.2f}h")
                        print(f"       Détail par besoin:")

                        for ligne in data["lignes"]:
                            print(f"          - {ligne['qte']} pièces le {ligne['date_exp']} ({ligne['charge']:.2f}h)")
                        print()

                    print(f"   TOTAL PRÉVISIONS: {total_qte:,} pièces".replace(",", " "))
                    print()
                else:
                    print("   Aucune prévision trouvée")
                    print()
            else:
                # Trier par charge décroissante
                for i, r in enumerate(sorted(weekly_results, key=lambda x: -x["charge"]), 1):
                    print(f"   [{i}] {r['article']}")
                    print(f"       Client: {r['client']}")
                    print(f"       Type: {r['type']}, Nature: {r['nature']}")
                    print(f"       Qté: {r['qte']}, Date: {r['date_exp']}")
                    print(f"       Charge: {r['charge']:.2f}h")

                    # Détail de la gamme
                    gamme = loader.get_gamme(r['article'])
                    if gamme:
                        for op in gamme.operations:
                            if op.poste_charge == poste:
                                print(f"       → Cadence: {op.cadence} u/h")
                                print(f"       → Calcul: {r['qte']} / {op.cadence} = {r['qte']/op.cadence:.2f}h")
                    print()
        else:
            print(f"📅 {week_label} ({start_date} → {end_date})")
            print(f"   Total: 0h")
            print(f"   Aucun besoin")
            print()

    print(f"{'='*100}")
    print(f"TOTAL GÉNÉRAL: {total_general:.2f}h")
    print(f"Nombre total de besoins: {total_besoins}")
    print(f"{'='*100}")


def analyze_article(article, semaine, horizon, loader, date_ref):
    """Analyse la charge d'un article (tous postes)."""
    print(f"\n{'='*100}")
    print(f"ANALYSE DE CHARGE : Article {article}")
    print(f"{'='*100}\n")

    # Trouver les besoins pour cet article
    horizon_days = horizon * 7
    besoins_article = [
        b for b in loader.commandes_clients
        if b.qte_restante > 0
        and b.article == article
        and 0 < (b.date_expedition_demandee - date_ref).days <= horizon_days
    ]

    print(f"📅 Date de référence : {date_ref}")
    print(f"📊 Horizon : {horizon} semaines")
    print(f"📋 Besoins trouvés pour {article} : {len(besoins_article)}\n")

    if semaine == "all":
        semaines = [f"S+{i}" for i in range(1, horizon + 1)]
    else:
        semaines = [semaine]

    for week_label in semaines:
        week_num = int(week_label.replace("S+", ""))
        start_date = date_ref + timedelta(days=(week_num-1)*7)
        end_date = start_date + timedelta(days=6)

        weekly_besoins = [
            b for b in besoins_article
            if get_week_info(b.date_expedition_demandee, date_ref)["week_label"] == week_label
        ]

        if weekly_besoins:
            print(f"📅 {week_label} ({start_date} → {end_date})")
            print(f"   Nombre de besoins: {len(weekly_besoins)}")
            print()

            total_qte = sum(b.qte_restante for b in weekly_besoins)

            # Calculer la charge pour tous les postes
            charge_by_poste = defaultdict(float)
            for besoin in weekly_besoins:
                charge = calculate_article_charge(
                    article=besoin.article,
                    quantity=besoin.qte_restante,
                    data_loader=loader
                )
                for poste, hours in charge.items():
                    charge_by_poste[poste] += hours

            # Afficher par poste
            print(f"   Qté totale: {total_qte}")
            print(f"   Charge par poste:")

            for poste in sorted(charge_by_poste.keys()):
                hours = charge_by_poste[poste]
                print(f"      {poste}: {hours:.2f}h")

            # Détail des besoins
            print()
            for i, b in enumerate(sorted(weekly_besoins, key=lambda x: x.date_expedition_demandee), 1):
                print(f"   [{i}] Qté: {b.qte_restante}, Date: {b.date_expedition_demandee}")
                print(f"       Client: {b.nom_client}, Type: {b.type_commande}, Nature: {b.nature_besoin}")
            print()
        else:
            print(f"📅 {week_label} ({start_date} → {end_date})")
            print(f"   Aucun besoin")
            print()


def main():
    parser = argparse.ArgumentParser(
        description="Analyse de charge par poste de charge ou article",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )

    parser.add_argument("--poste", type=str, help="Code du poste de charge (ex: PP_830)")
    parser.add_argument("--article", type=str, help="Code article (ex: 11035404)")
    parser.add_argument("--semaine", type=str, default="S+1",
                       help="Semaine à analyser (S+1, S+2, S+3, S+4, ou 'all') [défaut: S+1]")
    parser.add_argument("--horizon", type=int, default=4,
                       help="Horizon en semaines si --semaine=all [défaut: 4]")
    parser.add_argument("--list-postes", action="store_true",
                       help="Lister tous les postes de charge disponibles")
    parser.add_argument("--only-previsions", action="store_true",
                       help="Afficher uniquement les prévisions (détail complet)")
    parser.add_argument("--show-consumption", action="store_true",
                       help="Affiche le détail de la consommation des prévisions par article")
    parser.add_argument("--data-dir", type=str, default="data",
                       help="Répertoire des données [défaut: data]")

    args = parser.parse_args()

    # Charger les données
    print("Chargement des données...")
    loader = DataLoader(args.data_dir)
    loader.load_all()

    print(f"✅ {len(loader.articles)} articles chargés")
    print(f"✅ {len(loader.gammes)} gammes chargées")
    print(f"✅ {len(loader.commandes_clients)} commandes clients chargées")

    date_ref = date.today()

    # Exécuter l'action demandée
    if args.list_postes:
        list_postes(loader)
    elif args.poste:
        analyze_poste(args.poste, args.semaine, args.horizon, loader, date_ref, args)
    elif args.article:
        analyze_article(args.article, args.semaine, args.horizon, loader, date_ref)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
