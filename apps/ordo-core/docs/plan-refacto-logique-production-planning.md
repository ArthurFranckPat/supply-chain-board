# Plan De Refacto Logique - Production Planning

## Objectif

Stabiliser la logique metier de `production_planning` autour de quatre principes:

1. une seule interpretation des disponibilites composants
2. une seule interpretation des jours ouvres
3. une separation nette entre regles metier, calcul et reporting
4. un support coherent des quantites fractionnaires de bout en bout

## Etat deja traite

- Matching separe explicitement `MTS` et `MTO/NOR`
- Couverture multi-OF pour `MTO/NOR`
- Reliquat explicite dans les resultats de matching
- Respect reel de `use_receptions` dans `FeasibilityService`
- Quantites de lien de nomenclature repassees en `float`
- Unification pratique du calendrier
- Suppression de l'ancien pipeline scheduler parallele

## Chantiers restants

### 1. Availability Kernel

Construire une couche commune pour repondre a:

- stock disponible a date
- stock disponible sans receptions
- stock disponible avec allocations deja reservees
- manque net
- premiere date d'appro utile

Cette couche doit etre utilisee par:

- `feasibility/recursive.py`
- `feasibility/feasibility_service.py`
- `scheduling/material.py`
- `feasibility/analyse_rupture.py`
- `feasibility/residual_fabrication.py`

Resultat attendu:

- plus de divergences de logique entre faisabilite, rupture et scheduler
- moins de recalculs ad hoc
- tests metier plus simples a poser

### 2. Regles Metier Centralisees

Extraire les decisions metier transverses dans un module dedie, par exemple
`production_planning/domain_rules.py`.

Y centraliser:

- hard pegging `MTS`
- couverture cumulative `MTO/NOR`
- prevision vs commande ferme
- article achat / fabrication / sous-traitance / fantome
- OF ferme / planifie / suggere
- interpretation du composant "bloquant"

Resultat attendu:

- moins de branches metier dispersees
- moins de relecture necessaire pour verifier une regle

### 3. Separation Calcul / Diagnostic / Reporting

Refactorer les sorties pour distinguer:

1. resultat de calcul brut
2. diagnostic metier structure
3. rendu export / texte / API

Priorites:

- `matching.py`
- `feasibility_service.py`
- `scheduling/reporting.py`
- `utils/formatters.py`

Resultat attendu:

- moins de messages fabriques a meme les algorithmes
- possibilite de changer le reporting sans toucher au calcul

### 4. Scheduler: Pipeline Metier Explicite

Rendre explicites les etapes actuelles du scheduler:

1. selection des besoins a servir
2. couverture par stock / OF
3. verification composants / buffers
4. admissibilite capacitaire
5. ordonnancement ligne / jour
6. evaluation service / retard / non-couverture

Refactorer en gardant les heuristiques, mais en clarifiant leur place.

Modules cibles:

- `scheduling/engine.py`
- `scheduling/lines.py`
- `scheduling/heuristics.py`
- `scheduling/material.py`

Resultat attendu:

- moins de couplage implicite entre matching, composants et capacite
- meilleure lisibilite des arbitrages metier

## Ordre d execution recommande

1. construire l'`availability kernel`
2. centraliser les regles metier
3. simplifier les sorties de diagnostic
4. restructurer le scheduler autour du pipeline explicite

## Risques

- regression silencieuse si la logique de disponibilite n'est pas couverte par des cas metier representatifs
- confusion entre support des `float` en interne et contrats API encore saisis en entier
- derive si les futurs changements reintroduisent des helpers locaux au lieu d'utiliser la couche commune

## Tests a ajouter avant gros refacto

- disponibilite composant avec et sans receptions, avec et sans allocations
- composant fantome avec variantes fractionnaires
- couverture multi-OF + retard + capacite
- meme article analyse par faisabilite, rupture et scheduler avec resultat coherent
