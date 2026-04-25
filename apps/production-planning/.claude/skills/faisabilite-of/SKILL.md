---
name: faisabilite-of
description: |
  Vérifie la faisabilité d'un ou plusieurs Ordres de Fabrication (OF) en contrôlant récursivement la disponibilité des composants jusqu'aux articles ACHAT, via nomenclatures.csv. Compare les besoins avec le stock disponible (stock.csv) et les réceptions fournisseurs prévues (receptions_oa.csv). Gère la concurrence entre OF par règle de priorité (date + faisabilité). Retourne pour chaque OF : FAISABLE / PARTIEL / BLOQUÉ avec la liste des composants manquants et les dates de disponibilité. Déclencher ce skill dès que l'utilisateur mentionne : faisabilité OF, peut-on lancer, composants manquants, vérifier l'OF, rupture composant, affermir OF, composant en rupture, stock insuffisant pour OF, nomenclature, ou demande si un OF peut démarrer ou être lancé en production.
---

# Faisabilité OF

Vérification récursive de la faisabilité des Ordres de Fabrication par analyse des composants.

---

## 1. Données requises

| Fichier | Colonnes utilisées |
|---------|-------------------|
| `Nomenclatures.csv` | ARTICLE_PARENT, NIVEAU, ARTICLE_COMPOSANT, QTE_LIEN, TYPE_ARTICLE |
| `Stocks.csv` | ARTICLE, STOCK_PHYSIQUE, STOCK_ALLOUE, STOCK_BLOQUE |
| `Commandes Achats.csv` | ARTICLE, QUANTITE_RESTANTE, DATE_RECEPTION_PREVUE |
| `Articles.csv` | ARTICLE, TYPE_APPRO |
| `Ordres de fabrication.csv` | NUM_ORDRE, ARTICLE, DATE_DEBUT, DATE_FIN, QTE_RESTANTE_LIVRAISON, STATUT_ORDRE |

**Paramètres :**
- `--of` : numéro(s) d'OF à vérifier (ex: `F426-08419` ou `F426-08419,F426-08164`)
- `--mode` : `immediat` (stock seul) ou `projete` (stock + réceptions, par défaut)
- `--data-dir` : chemin vers les CSV

---

## 2. Calcul du stock disponible

```
stock_dispo(article) = STOCK_PHYSIQUE - STOCK_ALLOUE - STOCK_BLOQUE

# Mode projeté : ajouter les réceptions dont DATE_RECEPTION_PREVUE ≤ DATE_BESOIN
stock_projete(article, date_besoin) = stock_dispo(article)
    + SUM(QUANTITE_RESTANTE pour DATE_RECEPTION_PREVUE ≤ date_besoin)
```

---

## 3. Algorithme de vérification récursive

```python
def verifier_of(num_of, stock_virtuel):
    """
    stock_virtuel : dictionnaire article → stock restant après allocations précédentes
    Retourne : {statut, composants_manquants, composants_ok}
    """
    article = of_entetes[num_of].ARTICLE
    qte = of_entetes[num_of].QTE_RESTANTE
    date_fin = of_entetes[num_of].DATE_FIN

    nomenclature = nomenclatures[article]
    if not nomenclature:
        return {statut: "ALERTE", message: "Nomenclature non disponible"}

    composants_manquants = []
    for composant in nomenclature:
        besoin = composant.QTE_LIEN × qte

        if composant.TYPE == "Acheté":
            dispo = stock_projete(composant.ARTICLE, date_fin, stock_virtuel)
            if dispo >= besoin:
                stock_virtuel[composant.ARTICLE] -= besoin  # allouer virtuellement
            else:
                manque = besoin - max(0, dispo)
                composants_manquants.append({
                    article: composant.ARTICLE,
                    besoin: besoin,
                    dispo: dispo,
                    manque: manque
                })

        elif composant.TYPE == "Fabriqué":
            # Vérification récursive : peut-on fabriquer ce composant ?
            sous_result = verifier_composant_fabrique(
                composant.ARTICLE, besoin, date_fin, stock_virtuel
            )
            if sous_result.manquants:
                composants_manquants.extend(sous_result.manquants)

    if not composants_manquants:
        return {statut: "FAISABLE"}
    elif len(composants_ok) > 0:
        return {statut: "PARTIEL", manquants: composants_manquants}
    else:
        return {statut: "BLOQUÉ", manquants: composants_manquants}
```

### Règle d'affermissement (métier)
- Composant **ACHAT** en rupture → ❌ INTERDIT d'affermir
- Composant **FABRICATION** en rupture → ✅ AUTORISÉ (on peut lancer un OF pour le fabriquer)
- Mais vérifier récursivement les composants du composant FABRICATION

---

## 4. Gestion de la concurrence entre OF

Quand plusieurs OF sont vérifiés simultanément, gérer le partage du stock :

```
Algorithme de tri et d'allocation :
1. Trier les OF par DATE_FIN croissante (besoin le plus urgent en premier)
2. Pour chaque OF dans cet ordre :
   a. Vérifier la faisabilité avec le stock RESTANT (après allocations précédentes)
   b. Si FAISABLE → allouer virtuellement le stock (déduire des disponibilités)
   c. Si NON FAISABLE mais d'autres OF plus tardifs sont faisables →
      appliquer la règle de priorité faisabilité :
      un OF faisable mais plus tardif peut "passer devant" un OF bloqué
3. Résultat : liste ordonnée des OF avec leur statut et le stock consommé
```

**Règle de priorité faisabilité :** un OF 100% faisable prime sur un OF plus urgent mais bloqué, pour maximiser le nombre d'OF pouvant démarrer.

---

## 5. Script d'analyse

```bash
python3 .claude/skills/faisabilite-of/scripts/verif_faisabilite.py \
  --data-dir data \
  --of F426-08419,F426-08164 \
  --mode projete
```

---

## 6. Structure du rapport à produire

### Bloc 1 — Résumé

```
OF vérifiés : N
  ✅ FAISABLE   : X OF
  🟡 PARTIEL    : Y OF (faisables avec stock projeté)
  🔴 BLOQUÉ     : Z OF
  ⚠️  ALERTE    : W OF (nomenclature manquante)
```

### Bloc 2 — Détail par OF

Pour chaque OF :

```
OF F426-08419 | Article: BDH1050-75 | Qté: 384 | Date fin: 13/03/2026
Statut : 🔴 BLOQUÉ

Composants manquants :
  Article    | Désignation          | Besoin | Dispo | Manque | Récep. prévue
  E7368      | MOTEUR BDH 75W       | 384    | 150   | 234    | 25/03/2026 (250u)
  D4521      | CARTER ALU 150×100   | 768    | 200   | 568    | Aucune

  → Avec les réceptions : E7368 couvert le 25/03. D4521 reste bloquant.

Composants OK :
  Article    | Désignation          | Besoin | Dispo
  E1234      | VIS M4×10            | 1920   | 5000
```

### Bloc 3 — Recommandations

- OF faisables → "Peut être affermi immédiatement"
- OF partiels → "Faisable si réception [article] avant [date]"
- OF bloqués → "Lancer approvisionnement [article] en urgence" ou "Reporter au [date]"

---

## 7. Cas limites

| Situation | Comportement |
|-----------|-------------|
| Nomenclature absente (16% des cas) | Statut ALERTE, vérification manuelle requise |
| Composant FABRICATION sans nomenclature | Alerte récursive, mentionner explicitement |
| Stock négatif dans les données | Traiter comme 0, avertir |
| Récursion trop profonde (> 10 niveaux) | Stopper et signaler |
| OF déjà affermi (statut 1) | Le vérifier quand même, indiquer s'il est déjà lancé |
