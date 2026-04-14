#!/usr/bin/env python
"""Script : Analyse des commandes clients - LLM uniquement sur les cas problématiques.

Algorithme :
1. Vérifier si la commande est satisfaisable (stock + OF existants)
2. SI OK → Pas d'appel LLM
3. SI PAS OK → Appel LLM pour analyser le problème et proposer des actions
"""

import sys
import os
from pathlib import Path
from dotenv import load_dotenv

# Charger les variables d'environnement
load_dotenv()

# Ajouter src au path
sys.path.insert(0, str(Path(__file__).parent))

from src.loaders.data_loader import DataLoader
from src.decisions.llm.mistral_client import MistralLLMClient
from src.decisions.llm.llm_decision_rule import LLMBasedDecisionRule
from src.checkers import RecursiveChecker
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

console = Console()


def main():
    """Analyse les commandes clients avec LLM sur les cas problématiques uniquement."""
    console.print("[bold cyan]" + "=" * 80 + "[/bold cyan]")
    console.print("[bold cyan]ANALYSE COMMANDES CLIENTS - LLM SUR CAS PROBLÉMATIQUES[/bold cyan]")
    console.print("[bold cyan]" + "=" * 80 + "[/bold cyan]")
    console.print()

    # 1. Charger les données
    console.print("[bold cyan]1. Chargement des données...[/bold cyan]")
    loader = DataLoader(data_dir="data")
    console.print(f"   ✅ {len(loader.commandes_clients)} commandes clients")
    console.print(f"   ✅ {len(loader.ofs)} OFs disponibles")
    console.print(f"   ✅ {len(loader.stocks)} stocks")
    console.print()

    # 2. Initialiser le checker (récursif, avec réceptions)
    console.print("[bold cyan]2. Initialisation du checker récursif...[/bold cyan]")
    checker = RecursiveChecker(
        loader,
        use_receptions=True,  # Prend en compte les réceptions fournisseurs
        check_date=None  # Date du jour
    )
    console.print("   ✅ Checker initialisé")
    console.print()

    # 3. Initialiser le LLM (pour les cas problématiques)
    console.print("[bold cyan]3. Initialisation du LLM (cas problématiques)...[/bold cyan]")
    try:
        llm_client = MistralLLMClient(
            model="mistral-large-latest",
            temperature=0.3
        )
        decision_rule = LLMBasedDecisionRule(llm_client=llm_client)
        console.print("   ✅ LLM initialisé")
        console.print()
    except Exception as e:
        console.print(f"   [yellow]⚠️ LLM non disponible: {e}[/yellow]")
        console.print("   Continuation sans LLM...")
        decision_rule = None
        console.print()

    # 4. Récupérer les commandes à analyser
    commandes = [c for c in loader.commandes_clients if c.qte_restante > 0]
    console.print(f"[bold cyan]4. Analyse de {len(commandes)} commandes...[/bold cyan]")
    console.print()

    # 5. Analyse : Séparer OK / PAS OK
    results_ok = []  # Commandes déjà satisfaisables
    results_problematiques = []  # Commandes nécessitant une analyse LLM

    for i, commande in enumerate(commandes, 1):
        # Afficher la progression
        if i % 100 == 0 or i <= 20:
            console.print(f"[{i}/{len(commandes)}] {commande.num_commande}...")

        # Étape 1: Vérifier le stock
        stock_dispo = 0
        stock_info = loader.get_stock(commande.article)
        if stock_info:
            stock_dispo = max(0, stock_info.stock_physique - stock_info.stock_alloue - stock_info.stock_bloque)

        qte_allouee_stock = min(commande.qte_restante, stock_dispo)
        besoin_net = commande.qte_restante - qte_allouee_stock

        # Si le stock couvre tout → OK
        if besoin_net == 0:
            results_ok.append({
                "commande": commande,
                "raison": "Stock disponible",
                "stock_alloue": qte_allouee_stock
            })
            continue

        # Étape 2: Chercher un OF existant
        ofs_article = [of for of in loader.ofs if of.article == commande.article and of.qte_restante > 0]

        of_trouve = None
        if ofs_article:
            # Chercher OF affermi (statut 1) ou suggéré (statut 3)
            of_affermi = [of for of in ofs_article if of.statut_num == 1]
            of_suggere = [of for of in ofs_article if of.statut_num == 3]

            # Priorité aux OFs affermis
            for of_list in [of_affermi, of_suggere]:
                if of_list:
                    of = of_list[0]
                    qte_of_allouee = min(besoin_net, of.qte_restante)

                    # Vérifier si l'OF est faisable
                    try:
                        of_check = checker.check_of(of)

                        if of_check.feasible:
                            # OF faisable → Commande OK
                            of_trouve = of
                            results_ok.append({
                                "commande": commande,
                                "raison": f"OF faisable {of.num_of}",
                                "stock_alloue": qte_allouee_stock,
                                "of_alloue": of.num_of,
                                "qte_of": qte_of_allouee
                            })
                            break
                    except Exception as e:
                        # Erreur de vérification → considéré comme problématique
                        pass

        # Si OF trouvé et faisable → OK, on continue
        if of_trouve:
            continue

        # SINON → Cas problématique
        results_problematiques.append({
            "commande": commande,
            "stock_alloue": qte_allouee_stock,
            "besoin_net": besoin_net,
            "of_disponible": of_trouve.num_of if of_trouve else None
        })

        # Limiter l'analyse pour le test
        if len(results_problematiques) >= 20:
            console.print(f"   [yellow]Limité à {len(results_problematiques)} cas problématiques pour le test[/yellow]")
            break

    console.print()
    console.print("[bold cyan]" + "=" * 80 + "[/bold cyan]")
    console.print("[bold cyan]RÉSUME[/bold cyan]")
    console.print("[bold cyan]" + "=" * 80 + "[/bold cyan]")
    console.print()

    console.print(f"📊 Commandes analysées : {len(results_ok) + len(results_problematiques)}")
    console.print(f"   ✅ Satisfaisables : {len(results_ok)} ({len(results_ok)/(len(results_ok)+len(results_problematiques))*100:.1f}%)")
    console.print(f"   ⚠️  Problématiques : {len(results_problematiques)} ({len(results_problematiques)/(len(results_ok)+len(results_problematiques))*100:.1f}%)")
    console.print()

    # 6. Analyse LLM des cas problématiques
    if results_problematiques and decision_rule:
        console.print("[bold cyan]" + "=" * 80 + "[/bold cyan]")
        console.print("[bold cyan]ANALYSE LLM DES CAS PROBLÉMATIQUES[/bold cyan]")
        console.print("[bold cyan]" + "=" * 80 + "[/bold cyan]")
        console.print()

        for i, result in enumerate(results_problematiques, 1):
            commande = result["commande"]

            console.print(f"[{i}/{len(results_problematiques)}] [bold red]⚠️ {commande.num_commande}[/bold red]")
            console.print(f"    Client: {commande.nom_client}")
            console.print(f"    Article: {commande.article}")
            console.print(f"    Qté demandée: {commande.qte_restante}")
            console.print(f"    Date: {commande.date_expedition_demandee}")
            console.print(f"    Stock alloué: {result['stock_alloue']}")
            console.print(f"    Besoin net: {result['besoin_net']}")

            # Chercher le meilleur OF pour cette commande (même si non faisable)
            ofs_article = [of for of in loader.ofs if of.article == commande.article and of.qte_restante > 0]

            if ofs_article:
                # Prendre le OF affermi ou suggéré avec la plus grande quantité
                of = max(ofs_article, key=lambda o: o.qte_restante)

                console.print(f"    📦 OF disponible: {of.num_of} ({of.qte_restante} unités)")
                console.print()
                console.print(f"    🤖 [cyan]Analyse LLM...[/cyan]")

                try:
                    # Appel au LLM pour analyser le cas
                    decision = decision_rule.evaluate(
                        of=of,
                        commande=commande,
                        loader=loader
                    )

                    # Afficher la décision et les actions
                    action_emoji = {
                        "accept_as_is": "✅",
                        "accept_partial": "🟡",
                        "defer": "⏰",
                        "defer_partial": "⏰🟡",
                        "reject": "❌"
                    }.get(decision.action.value, "❓")

                    console.print(f"    {action_emoji} [bold]Décision: {decision.action.value}[/bold]")

                    if decision.modified_quantity:
                        console.print(f"       📊 Quantité suggérée: {decision.modified_quantity}")

                    if decision.defer_date:
                        console.print(f"       📅 Date report: {decision.defer_date}")

                    # Action requise - C'EST LE PLUS IMPORTANT
                    if decision.metadata.get("action_required"):
                        console.print()
                        console.print(f"    [bold yellow]⚡ ACTION REQUISE:[/bold yellow]")
                        console.print(f"       {decision.metadata['action_required']}")

                    # Raison
                    console.print()
                    console.print(f"    💭 {decision.reason}")

                    result["decision"] = decision

                except Exception as e:
                    console.print(f"    [bold red]❌ Erreur LLM: {e}[/bold red]")
                    result["erreur"] = str(e)

            else:
                console.print(f"    [red]❌ Aucun OF disponible pour cet article[/red]")
                result["sans_of"] = True

            console.print()

    # 7. Tableau récapitulatif des cas problématiques
    if results_problematiques:
        console.print("[bold cyan]" + "=" * 80 + "[/bold cyan]")
        console.print("[bold cyan]TABLEAU DES CAS PROBLÉMATIQUES[/bold cyan]")
        console.print("[bold cyan]" + "=" * 80 + "[/bold cyan]")
        console.print()

        table = Table(show_header=True, header_style="bold magenta")
        table.add_column("Commande", style="cyan")
        table.add_column("Client")
        table.add_column("Article")
        table.add_column("Qté")
        table.add_column("Besoin")
        table.add_column("OF")
        table.add_column("Décision LLM")
        table.add_column("Action")

        for r in results_problematiques:
            c = r["commande"]
            of_str = r.get("of_disponible") or "-"
            decision_str = "-"
            action_str = "-"

            if "decision" in r and r["decision"]:
                decision_str = r["decision"].action.value
                action_str = r["decision"].metadata.get("action_required", "-")[:30]
            elif "sans_of" in r:
                decision_str = "PAS D'OF"
                action_str = "Créer OF urgent"
            elif "erreur" in r:
                decision_str = "ERREUR"
                action_str = "Révision manuelle"

            table.add_row(
                c.num_commande,
                c.nom_client[:15],
                c.article[:10],
                str(c.qte_restante),
                str(r["besoin_net"]),
                str(of_str)[:10] if of_str != "-" else "-",
                decision_str[:15],
                action_str
            )

        console.print(table)
        console.print()

    console.print("[bold green]✅ ANALYSE TERMINÉE[/bold green]")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        console.print("\n[bold red]❌ Interruption[/bold red]")
        sys.exit(1)
