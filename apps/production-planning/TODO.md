# TODO - Évolutions futures

## Optimisation de la quantité de production

### Cas d'usage : Composant 11019971

**Problème identifié** :
- OF SGAE10624376604 nécessite 147 unités de l'article 11019149
- Manque : **2 unités** du composant 11019971 sur plusieurs commandes
- Conséquence : Toutes les commandes sont retardées (0/147 livrées)

**Optimisation suggérée** :
- Produire **145 unités** au lieu de 147
- Service client : 145/147 = **98.6%** du besoin satisfait
- Retard limité : Seulement 2 unités à livrer plus tard
- Impact client : Minimisé

### Algorithme d'optimisation à développer

**Principe** : Quand un OF est non faisable pour un manque réduit d'un composant unique :
1. Identifier le composant critique (manque < 5% du besoin)
2. Calculer la quantité maximale réalisable avec le stock disponible
3. Proposer une production partielle optimisée

**Exemple** :
```
Besoin : 147 unités
Stock disponible composant : 145 unités
→ Produire 145 au lieu de 147
→ 98.6% du besoin satisfait immédiatement
→ Seulement 2 unités en retard
```

**Bénéfices** :
- ✅ Maximiser le taux de service immédiat
- ✅ Minimiser les retards clients
- ✅ Optimiser l'utilisation du stock
- ✅ Réduire le nombre de commandes impactées

### Intégration LLM suggérée

**Objectif** : Utiliser un LLM pour apporter une intelligence contextuelle à l'optimisation.

**Cas d'usage** :
- Analyser les ruptures et proposer des alternatives intelligemment
- Prendre en compte des facteurs contextuels (urgence client, facilité de réappro, etc.)
- Générer des recommandations d'optimisation en langage naturel

**Exemples de scénarios** :

1. **Manque critique sur un composant unique**
   - Analyse : "Manque 2 unités de 11019971 pour produire 147 unités"
   - Recommandation LLM : "Produire 145 unités maintenant (98.6% du besoin) et reporter 2 unités sur la prochaine production"

2. **Choix entre plusieurs OFs non faisables**
   - Analyse : "3 OFs en concurrence pour le même composant, stock limité"
   - Recommandation LLM : "Prioriser F426-10030 (client ALDES, urgence élevée) sur F126-42717 (client PARTN-AIR, urgence moyenne)"

3. **Réceptions fournisseurs imminentess**
   - Analyse : "Rupture mais réception prévue dans 2 jours"
   - Recommandation LLM : "Retarder la production de 2 jours pour aligner avec la réception et produire à 100%"

**Architecture proposée** :
```
Système actuel (vérification faisabilité)
    ↓
Détection d'OFs non faisables
    ↓
Analyse LLM (Compréhension du contexte)
    ↓
Recommandations d'optimisation
    ↓
Validation par l'ordonnanceur
    ↓
Ajustement des quantités/priorités
```

**Prompts LLM types** :
- "Voici une rupture : composant X manque Y unités pour produire Z unités. Quelles sont les options d'optimisation ?"
- "3 commandes sont en concurrence pour le même stock. Comment prioriser intelligemment ?"
- "Une réception fournisseur est prévue dans J jours. Faut-il retarder la production ou produire partiellement ?"

**Bénéfices attendus** :
- 🧠 Intelligence contextuelle au-delà des règles algorithmiques
- 📝 Recommandations explicables en langage naturel
- 🎯 Prise de décision assistée pour l'ordonnanceur
- 📈 Amélioration continue du système d'ordonnancement

---

## Autres évolutions futures

### 1. Tableau de bord interactif
- Visualisation des ruptures en temps réel
- Simulation d'ajustements de quantités
- Drag & drop pour prioriser les OFs

### 2. Alertes proactives
- Détection anticipée des ruptures (S+2, S+3)
- Recommandations de réapprovisionnement
- Notification des ordonnanceurs

### 3. Apprentissage automatique
- Prédiction des besoins futurs
- Optimisation des stocks de sécurité
- Recommandation de délais de production

### 4. Intégration ERP
- Synchronisation avec le système de production
- Mise à jour automatique des statuts OF
- Suivi en temps réel de la production

---

**Priorités** :
1. ✅ Vérification de faisabilité avec allocation virtuelle
2. ✅ Prise en compte des réceptions fournisseurs
3. ⏳ Optimisation des quantités de production (cette note)
4. ⏳ Intégration LLM pour recommandations intelligentes
5. ⏳ Tableau de bord interactif

## TODO - Flux Extractions ERP

- [ ] Mapper correctement les champs mentionnes dans `Besoins Clients.csv`:
  - `type_commande`
  - `code_pays`
- [ ] Documenter explicitement les regles de mapping retenues (source ERP -> modele metier).
- [ ] Prendre en compte les stocks en statut Q dans la consommation virtuelle des stocks.
