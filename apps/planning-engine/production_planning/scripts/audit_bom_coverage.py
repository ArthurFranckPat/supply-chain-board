#!/usr/bin/env python3
from __future__ import annotations

import csv
import os
import sys
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from erp_data_access.loaders import DataLoader


def get_besoins_by_article(loader: DataLoader, article: str) -> list:
    return [b for b in loader.commandes_clients if b.article == article and b.qte_restante > 0]


def main():
    print('=== Audit de couverture nomenclature ===\n')

    extractions_dir = os.environ.get('ORDO_EXTRACTIONS_DIR', 'data')
    if not Path(extractions_dir).exists():
        print(f'ERROR: Directory not found: {extractions_dir}')
        print('Set ORDO_EXTRACTIONS_DIR environment variable')
        return 1

    print(f'Chargement des données depuis: {extractions_dir}')
    loader = DataLoader.from_extractions(extractions_dir)

    fab_articles = loader.get_articles_fabrication()
    total_fab = len(fab_articles)
    print(f'Articles FABRICATION total: {total_fab}\n')

    missing_bom: list[dict] = []
    category_counter: Counter = Counter()
    of_volume_counter: Counter = Counter()

    thirty_days_ago = date.today() - timedelta(days=30)

    for article in fab_articles:
        nomen = loader.get_nomenclature(article.code)
        if nomen is not None:
            continue

        # Article without BOM
        ofs = loader.get_ofs_by_article(article.code)
        recent_ofs = [of for of in ofs if of.date_fin and of.date_fin >= thirty_days_ago]

        besoins = get_besoins_by_article(loader, article.code)
        active_besoins = [b for b in besoins if b.qte_restante > 0]

        last_use = None
        if ofs:
            dates = [of.date_fin for of in ofs if of.date_fin]
            if dates:
                last_use = max(dates)

        missing_bom.append({
            'article': article.code,
            'designation': article.description,
            'categorie': article.categorie,
            'nb_of_total': len(ofs),
            'nb_of_recents': len(recent_ofs),
            'nb_besoins_actifs': len(active_besoins),
            'derniere_utilisation': last_use.isoformat() if last_use else '',
        })

        category_counter[article.categorie] += 1
        of_volume_counter[article.code] = len(recent_ofs)

    missing_count = len(missing_bom)
    coverage_pct = ((total_fab - missing_count) / total_fab * 100) if total_fab > 0 else 0

    print('--- Résumé ---')
    print(f'Articles avec nomenclature: {total_fab - missing_count}')
    print(f'Articles SANS nomenclature: {missing_count}')
    print(f'Taux de couverture: {coverage_pct:.1f}%')

    print('--- Top 10 catégories sans BOM ---')
    for cat, count in category_counter.most_common(10):
        print(f'  {cat}: {count} articles')

    print('\n--- Top 10 articles manquants par volume OF recent ---')
    for article_code, count in of_volume_counter.most_common(10):
        article_data = next((m for m in missing_bom if m['article'] == article_code), None)
        if article_data:
            print(f"  {article_code}: {count} OFs récents ({article_data.get('categorie', '')})")

    # Write CSV output
    output_dir = Path('outputs')
    output_dir.mkdir(exist_ok=True)
    output_file = output_dir / 'bom_coverage_audit.csv'

    with output_file.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=[
            'article', 'designation', 'categorie',
            'nb_of_total', 'nb_of_recents', 'nb_besoins_actifs',
            'derniere_utilisation',
        ])
        writer.writeheader()
        for row in sorted(missing_bom, key=lambda x: x['nb_of_recents'], reverse=True):
            writer.writerow(row)

    print(f'\nCSV généré: {output_file}')
    print(f'Lignes écrites: {missing_count}')

    return 0


if __name__ == '__main__':
    sys.exit(main())
