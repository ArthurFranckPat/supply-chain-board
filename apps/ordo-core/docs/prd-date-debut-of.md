# PRD — Ajout de DATE_DEBUT dans les OF et utilisation pour la faisabilité composants

## Contexte

Le `ProjectedChecker` vérifie la faisabilité d'un OF en contrôlant si les réceptions
fournisseurs arrivent à temps pour les composants manquants. La date de référence
actuellement utilisée est `DATE_FIN` de l'OF (fournie par le CBN).

**Problème** : le jalonnement CBN produit parfois des `DATE_FIN` incohérentes. De plus,
les composants doivent être disponibles au **lancement** de l'OF, pas à sa date de fin.
La date de lancement réelle correspond à `DATE_DEBUT` de l'OF.

## Règle métier actuelle (implémentée)

En attendant la `DATE_DEBUT`, l'algorithme applique la logique suivante par ordre de priorité :

1. **Si l'OF a une commande liée** (MTS via `OF_CONTREMARQUE`) :
   `date_ref = date_expedition_commande - 2 jours`
2. **Sinon** (NOR/MTO, pas de commande liée) :
   `date_ref = date_fin_of - 2 jours`

Le J-2 représente le délai minimal entre la réception d'un composant et le lancement
effectif de l'OF (réception physique, contrôle, mise en stock).

Les réceptions fournisseurs incluses dans le stock projeté sont celles dont
`date_reception_prevue < date_ref` (strict).

## Évolution demandée

### Ajouter `DATE_DEBUT` dans l'export `ORDOF`

Ajouter la colonne `DATE_DEBUT` dans le fichier `of_entetes.csv` exporté depuis l'ERP.

| Colonne | Type | Description |
|---|---|---|
| `DATE_DEBUT` | date (`DD/MM/YYYY`) | Date de lancement prévue de l'OF (jalonnement CBN) |

### Mise à jour du modèle `OF`

Ajouter le champ `date_debut: Optional[date]` dans [src/models/of.py](../src/models/of.py)
et le parser dans `from_csv_row`.

### Mise à jour de la logique de faisabilité

Remplacer la règle actuelle par la priorité suivante dans `RecursiveChecker._get_date_besoin_commande` :

```
1. Si of.date_debut est renseignée → date_ref = date_debut
2. Elif commande liée (OF_CONTREMARQUE) → date_ref = date_expedition_commande - 2 jours
3. Else → date_ref = date_fin_of - 2 jours
```

### Mise à jour du CLAUDE.md

Ajouter `DATE_DEBUT` dans la structure de `of_entetes.csv`.

## Fichiers impactés

| Fichier | Modification |
|---|---|
| `src/models/of.py` | Ajouter `date_debut: Optional[date]` + parsing |
| `src/checkers/recursive.py` | Utiliser `of.date_debut` en priorité dans `_get_date_besoin_commande` |
| `CLAUDE.md` | Documenter `DATE_DEBUT` dans la table `of_entetes.csv` |

## Critères d'acceptation

- [ ] `DATE_DEBUT` parsée correctement depuis le CSV (format `DD/MM/YYYY`, `None` si absente)
- [ ] `ProjectedChecker` utilise `date_debut` si disponible
- [ ] Fallback sur commande liée - 2j si `date_debut` absente
- [ ] Fallback sur `date_fin` - 2j si ni `date_debut` ni commande liée
- [ ] `F426-11691` reste non faisable avec les données actuelles
