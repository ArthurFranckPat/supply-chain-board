# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primaires** : le service ordonnancement / planification du site AE1. Les planners construisent, surveillent et ajustent le programme de production au fil de la journée — poste par poste, OF par OF, commande par commande.

**Secondaires (confirmés)** :
- Supply chain élargie : stock, achats, expéditions/réceptions — suivent les ruptures, la faisabilité et les flux.
- Management / direction : lecture des KPI, arbitrages, comités de plan.
- Atelier / production : chefs de poste / de ligne qui exécutent l'ordonnancement.

Situation d'usage : **écran consulté en temps réel pendant la journée** — pas un rituel d'impression ni un outil d'analyse ponctuelle. La fraîcheur des données et la vitesse de lecture sont des attributs de première classe.

## Product Purpose

Le Supply Chain Board est la vision opérationnelle consolidée de la chaîne d'approvisionnement du site AE1, posée au-dessus de Sage X3 : programme d'ordonnancement, suivi des commandes, ruptures, charge, expéditions/réceptions, cockpit poste et KPI. Il rend le plan de production lisible, vérifiable et contestable sans toucher à l'ERP.

La mécanique de valeur prioritaire est double :
1. **Anticiper les ruptures** — détection proactive des manquants et faisabilité des nouveaux OF.
2. **Piloter la charge et l'engagement** — charge par poste, engagement réel, OF tenus vs dérivés.

Le succès se mesure à la capacité de l'équipe à voir arriver un problème avant qu'il ne devienne une rupture, et à trancher où appuyer sur le plan.

## Positioning

Ce qu'un voisin ne peut pas copier : le moteur de diagnostic maison qui lit X3 en direct (SOAP) et produit des **verdicts vérifiables** — faisabilité récursive, détection de ruptures avec preuve, projection de charge calendaire pondérée — là où le planning X3 ne donne qu'une vue figée. Le board est une couche de décision qui ne fait pas confiance à l'ERP : il re-calcule, trace et explique (ledger de preuve, diff de plan, verdicts explicitables).

## Operating Context

- App web interne AdonisJS + React (Inertia), déployée sur LAN Windows (en cours, issue #116), données Sage X3 via SOAP — coûteux, d'où réplique SQLite locale + cache Redis pour les lectures.
- Écran temps réel : les planners le consultent en continu ; une réponse lente est un défaut produit, pas un détail technique.
- Langue : français, format de dates jj/mm/aaaa à l'écran.
- Impression A3 disponible sur certaines surfaces (board, ruptures) — annexe du mode temps réel, pas le mode principal.
- Accès réservé à l'équipe, authentification déléguée.

## Capabilities and Constraints

Capacités confirmées :
- Programme d'ordonnancement : board kanban, drag & drop, engagement par poste, diff de plan, mode scénario.
- Ruptures : file de triage, faisabilité récursive, suivi proactif / réactif, verdicts avec preuve.
- Charge : capacité atelier (WORKSTATIO×TABWEEDIA), calendrier usine / fériés / fermetures, overlay saturation.
- Suivi commandes, expéditions (palettes ESH), réceptions, besoin camions.
- Cockpit poste (#119) : réalisé, anomalies, engagement par poste.
- KPI dashboard, liens « Ouvrir dans X3 », copilote agentique lecture-seule (#89).
- Réplique SQLite, cache Redis par user, cache L1 en lecture seule.

Contraintes durables :
- Toutes les queries X3 passent par SOAP (ZSOAPSQL, coût O(n²)) : toute nouvelle surface doit minimiser les round-trips et préférer la réplique SQLite.
- Domaine métier pur (app/domain), règles de matching / faisabilité verrouillées par des tests de contrat.
- Règles métier figées : ROUALT_0=1, exclusion des composants Z, poste = données de CE poste (jamais de somme), stock statut Q compté dispo, dates françaises.
- Gate de dev : typecheck + lint ; jamais de suite de tests complète en local.

## Brand Commitments

- Nom : « Supply Chain Board » — outil interne du site Aldes AE1.
- Design system « Airbnb » : grammaire rausch #ff385c / ink #222 / Plus Jakarta Sans, rayons 8/14/pill — thème produit actif (bascule 21/07/2026), adhésion forte de l'utilisateur sur les surfaces board et ruptures ; remplace le bleu #0069B4 sur ces pages. Socle d'impression A3.
- Voix : français de l'atelier et de la planification — libellés clairs et directs, pas de ton marketing.

## Evidence on Hand

- Données réelles X3 servies par les endpoints (site AE1, 100 % CBN) ; les mockups UI sont construits sur des données réelles.
- Docs internes : `docs/prd-23-impacts-programme.md`, `docs/prd-ctp-date-au-plus-tot.md`, `docs/capacite-charge.md`, `docs/vision-scenarios-impacts.md`, `docs/cache-redis.md`, `docs/plan-migration-frontend.md`.
- Mockups (archives de décision, plus d'actualité) : `_design/archive/` — le design system vivant est dans le code (`resources/css/app.css`, composants `inertia/components/`, page `/design-system`).
- À ne pas fabriquer : pas de témoignages clients ni de benchmarks externes (outil interne) ; pas de chiffres de pricing.

## Product Principles

1. **L'ERP n'est pas la vérité** : re-calculer, tracer, prouver. Chaque verdict (rupture, faisabilité, diff) doit pouvoir s'expliquer.
2. **Le temps réel est un attribut de produit** : écran consulté en continu → fraîcheur des données et vitesse de lecture passent avant le cosmétique.
3. **Le domaine est pur et verrouillé** : les règles qui engagent des décisions (matching, faisabilité, ruptures) ne changent que par tests de contrat.
4. **Chaque poste montre ses propres données, jamais une somme** : les vues par poste de charge dérivent des données de CE poste (postes jumeaux, issues répétées).
5. **Le français d'atelier** : libellés directs, dates jj/mm/aaaa, zéro jargon.

## Accessibility & Inclusion

- Pas d'exigence d'accessibilité produit spécifique au-delà des standards du web ; le travail a11y clavier sur /programme (issue #62, lot 1) est la référence à maintenir pour les surfaces interactives.