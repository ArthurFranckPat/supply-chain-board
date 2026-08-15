# Page de configuration et d'administration du mode de données

> **Status:** Proposed for review

## 1. Executive summary

Aujourd'hui, le mode de données est fixé au démarrage par la variable d'environnement `REPLICA_READS` dans le fichier `.env`. Pour basculer entre la lecture sur réplique SQLite ultra-rapide (~4 ms) et la lecture directe sur Sage X3 via SOAP, il faut modifier un fichier serveur et redémarrer le processus. De plus, les utilisateurs et administrateurs ne disposent d'aucune vue sur la santé des tables répliquées, la fraîcheur des données, les motifs de repli vers la voie directe, ni d'aucun moyen de déclencher manuellement une resynchronisation depuis l'interface web.

Ce projet ajoute un nouvel écran d'administration `/configuration/donnees`, intégré comme troisième volet de la section Configuration (aux côtés de Calendrier et Impressions). Cet écran permet de basculer dynamiquement le mode de lecture (Réplique, Direct X3 ou Hérité du .env), d'observer en temps réel l'état de santé et la fraîcheur des 8 tables répliquées, de déclencher des synchronisations unitaires ou globales, et de consulter le journal des ingestions et erreurs X3.

Le principal inconvénient est d'introduire un état dynamique d'architecture en base de données, qui nécessite de veiller à ce qu'une bascule en mode réplique ne serve jamais de données corrompues si l'ingestion est dégradée (couvert par le garde-fou `ReplicaGate`).

## 2. Context and scope

L'application Supply Chain Board supporte deux architectures de lecture exclusives :
1. **Mode Direct X3 (`REPLICA_READS=false`)** : requêtes SOAP en direct sur Sage X3, amorties par un préchauffage de cache en mémoire (`cache_preheat_provider`).
2. **Mode Réplique (`REPLICA_READS=true`)** : requêtes SQL locales sur base SQLite/libSQL (`tmp/replica.sqlite3`), alimentée par un worker périodique (`replica_sync_provider`).

Le composant `ReplicaGate` sécurise chaque lecture réplique en vérifiant 3 règles (provenance d'environnement, confirmation d'écriture sans salissure, et fraîcheur maximale `MAX_AGE_MS`). En cas d'anomalie, `ReplicaGate` bascule automatiquement sur la voie directe X3.

Le périmètre de ce design comprend :
- L'ajout d'une table `system_settings` dans la base applicative pour persister le mode de données souhaité.
- L'adaptation de `ReplicaGate` pour prendre en compte le réglage dynamique sans nécessiter de redémarrage.
- Une nouvelle page Inertia React `/configuration/donnees` sous le layout d'administration existant.
- Les endpoints API sous `/api/v1/config/data/*` pour piloter le mode, lire les statuts, déclencher les synchronisations et paginer les journaux d'ingestion.

## 3. System context

```
┌─────────────────────────────────────────────────────────────┐
│             Navigateur Client (Inertia React)              │
│   Page /configuration/donnees (Sous-nav: Données / Sync)    │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / Inertia API
                               ▼
┌─────────────────────────────────────────────────────────────┐
│          AdonisJS (DataConfigController)                    │
├──────────────────────────────┬──────────────────────────────┤
│  SystemSettingsRepository   │       ReplicaSyncService     │
│  (Lecture/écriture mode)    │       (syncAll, syncTable)   │
└──────────────┬──────────────┴──────────────┬────────────────┘
               │                             │
       ┌───────┴───────┐             ┌───────┴───────┐
       ▼               ▼             ▼               ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ App SQLite  │ │ ReplicaGate │ │ Replica     │ │ Sage X3     │
│ system_     │ │ Arbitre de  │ │ SQLite      │ │ SOAP API    │
│ settings    │ │ lecture     │ │ IngestionLog│ │ (ZSOAPSQL)  │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

## 4. Proposed design

### How it works

1. **Affichage de la page** : L'administrateur navigue sur `/configuration/donnees`. Le contrôleur renvoie l'état du mode courant (`replica`, `direct` ou `env_default`), le mode effectif actuellement appliqué, l'état synthétique des 8 tables répliquées (verdict `ReplicaGate`, âge, date du dernier run complet, nombre d'enregistrements), et les 20 derniers logs d'ingestion.
2. **Changement de mode** : L'administrateur bascule l'interrupteur sur "Mode Réplique". Une requête `POST /api/v1/config/data/mode` met à jour `system_settings`. Dès la requête suivante, `ReplicaGate.replicaReadsEnabled()` résout le nouveau mode sans redémarrer le serveur.
3. **Synchronisation manuelle** : L'administrateur clique sur "Synchroniser tout" (ou sur une table spécifique comme `stock_replica`). Le contrôleur lance la tâche en arrière-plan via `ReplicaSyncService` et répond immédiatement avec un statut en cours. L'interface rafraîchit les indicateurs une fois le run terminé.

### Components and responsibilities

- **`DataConfigController`** :
  - *Possède* : Réception des requêtes web et API de configuration de données, validation des payloads, orchestration entre repositories et services de synchronisation.
  - *Ne possède pas* : L'exécution SQL directe des requêtes de réplique ou les appels SOAP X3 bas niveau.
- **`SystemSettingsRepository`** :
  - *Possède* : Persistance et lecture clé-valeur dans la table `system_settings` de la base applicative (`tmp/db.sqlite3`).
  - *Ne possède pas* : La logique de décision de repli ou les données de réplique.
- **`ReplicaGate`** :
  - *Possède* : L'arbitrage de chaque lecture de table (`replica` vs `direct`), la lecture de l'état dynamique de lecture avec fallback sur `.env`.
  - *Ne possède pas* : L'interface utilisateur ni le déclenchement des syncs.
- **`ReplicaSyncService`** :
  - *Possède* : L'extraction SOAP X3, le swap transactionnel des tables SQLite, l'écriture dans `ingestion_log` et la levée/réinitialisation des drapeaux `replica_dirty`.
  - *Ne possède pas* : L'affichage UI.
- **Page Frontend React (`inertia-react/pages/config/donnees.tsx`)** :
  - *Possède* : Le rendu visuel (thème Cursor, `ToolbarSegmented`, cartes d'état, tableau des tables avec badges de statut et de fraîcheur, journal d'ingestion avec tiroir de détail d'erreur).
  - *Ne possède pas* : La logique métier de synchro.

### Decisions

- **Persistance en base de données applicative (`system_settings`) plutôt qu'en session utilisateur** : Le mode de lecture est une décision d'architecture d'application partagée par tous les utilisateurs d'un environnement. Stocker ce réglage en base SQLite locale garantit la cohérence entre toutes les requêtes du serveur tout en survivant aux redémarrages.
- **Support d'un mode `env_default` (Hérité de l'environnement)** : Permet de réinitialiser le comportement pour qu'il suive strictement la variable `REPLICA_READS` du `.env` en cas de besoin de maintenance opérationnelle.
- **Garde-fou automatique de dégradation conservé** : Même si un administrateur force le "Mode Réplique", `ReplicaGate` continue d'appliquer ses 3 règles de sécurité (non-ingéré, erreur, salissure, péremption). Si la réplique est invalide, la lecture bascule silencieusement en direct X3 avec indication visuelle explicite sur la page de config.
- **Exécution asynchrone non bloquante des synchronisations manuelles** : Les appels SOAP X3 peuvent prendre de 5 à 30 secondes. L'API lance la synchronisation en tâche asynchrone avec verrou anti-concurrence et informe le client, évitant ainsi tout timeout HTTP de passerelle.

## 5. Invariants and requirements

### Invariants
1. `ReplicaGate.replicaReadsEnabled()` doit toujours renvoyer un booléen déterministe : valeur de `system_settings` si définie, sinon `env.get('REPLICA_READS', false)`.
2. Une synchronisation manuelle ne doit jamais s'exécuter en parallèle d'une autre synchronisation sur la même table (verrou mutex partagé avec le provider périodique).
3. Les secrets et identifiants de connexion SOAP X3 ne doivent jamais être exposés dans les logs d'ingestion retournés à l'UI (assuré par `sanitizeError` / `curl_credentials`).
4. La réinitialisation des salissures (`replica_dirty`) ne doit être possible que pour les tables existantes.

### Requirements
- La sous-navigation de la section `/configuration` doit comporter trois onglets : `Calendrier`, `Impressions` et `Données`.
- La page doit afficher clairement le mode configuré vs le mode effectif.
- Pour chacune des 8 tables répliquées, afficher :
  - Nom logique et nom technique de la table.
  - Statut : Opérationnel (Vert), En retard / Périmé (Orange), Erreur / Non ingéré (Rouge), Voie directe forcée (Gris).
  - Date et heure du dernier run réussi en format local (jj/mm/aaaa hh:mm).
  - Durée du dernier run et nombre de lignes en base.
  - Action unitaire "Synchroniser".
- Un bouton d'action global "Synchroniser toutes les tables actives".
- Un tableau paginé des 50 derniers événements d'`ingestion_log` avec filtre par statut (Tous / Erreurs / Succès) et affichage du détail des erreurs dans une boîte modale ou un tiroir.

## 6. Interfaces and data

### Modèle de données : `system_settings`

Table créée dans la base applicative (`tmp/db.sqlite3`) via une migration Lucid :

```typescript
// database/migrations/xxxx_create_system_settings_table.ts
t.string('key').primary()
t.text('value').notNullable()
t.string('updated_by').notNullable().defaultTo('system')
t.integer('updated_at').notNullable()
```

Clé gérée pour le mode : `data_mode` (`'replica' | 'direct' | 'env'`).

### Endpoints API

- `GET /configuration/donnees` : Page Inertia React complète.
- `GET /api/v1/config/data/status` :
  - **Réponse 200** :
    ```json
    {
      "configuredMode": "replica",
      "effectiveMode": true,
      "envDefaultMode": true,
      "isSyncRunning": false,
      "tables": [
        {
          "table": "orders_flux_replica",
          "label": "Commandes & Suggestions (ORDERS)",
          "source": "replica",
          "reason": null,
          "lastRunAt": "2026-08-14T08:00:00.000Z",
          "lastDurationMs": 13420,
          "rowCount": 4520,
          "isDirty": false,
          "maxAgeMinutes": 15
        }
      ]
    }
    ```
- `POST /api/v1/config/data/mode` :
  - **Corps** : `{ "mode": "replica" | "direct" | "env" }`
  - **Réponse 200** : `{ "ok": true, "mode": "replica" }`
- `POST /api/v1/config/data/sync` :
  - **Corps** : `{ "table": "orders_flux_replica" | "all" }`
  - **Réponse 202** : `{ "ok": true, "message": "Synchronisation lancée" }`
  - **Réponse 409** : `{ "ok": false, "message": "Une synchronisation est déjà en cours" }`
- `POST /api/v1/config/data/reset-dirty` :
  - **Corps** : `{ "table": "orders_flux_replica" | "all" }`
  - **Réponse 200** : `{ "ok": true }`
- `GET /api/v1/config/data/logs?page=1&limit=25&status=all` :
  - **Réponse 200** : `{ "data": [...], "meta": { "total": 120, "page": 1, "lastPage": 5 } }`

### Naming and identity

- Identifiant de configuration : clé unique textuelle standardisée (`data_mode`).
- Noms des tables de réplique : conformes au type `ReplicaTable` (`orders_flux_replica`, `stock_replica`, etc.).

## 7. Failure behavior and lifecycle

- **Erreur Sage X3 lors d'une synchronisation manuelle** : L'échec est capturé, nettoyé de toute information sensible, consigné dans `ingestion_log` avec `status = 'error'`, et le verrou d'ingestion est immédiatement relâché. `ReplicaGate` maintient ou bascule la table en voie directe.
- **Arrêt / Redémarrage du serveur** : Le mode configuré dans `system_settings` persiste. Si la base est inaccessible, le système retombe automatiquement sur `REPLICA_READS` de l'environnement `.env`.
- **Concurrence de synchronisation** : Si un tick périodique (`replica_sync_provider`) s'exécute au moment où un utilisateur clique sur "Synchroniser", la requête retourne une réponse HTTP 409 explicite ("Synchronisation déjà en cours") sans altérer le processus.

## 8. Security, privacy, and operations

- **Autorisation** : Toutes les routes `/configuration/*` et `/api/v1/config/*` sont protégées par le middleware `auth()`.
- **Protection des données sensibles** : Les traces d'erreurs SOAP et URLs contenant des identifiants sont expurgées avant affichage ou insertion par la routine `sanitizeError()`.
- **Impact opérationnel et charge X3** : Pour éviter qu'un utilisateur n'épuise le pool SOAP ZSOAPSQL par des clics répétés, un délai de garde (cooldown de 10 secondes) et un verrou d'exécution unique sont appliqués sur l'API de synchronisation.

## 9. Acceptance criteria

- [ ] L'URL `/configuration/donnees` est accessible depuis le menu de navigation et la sous-navigation des pages de configuration.
- [ ] La sous-navigation `ToolbarSegmented` est synchronisée sur les 3 pages (`/configuration/calendrier`, `/configuration/impressions`, `/configuration/donnees`).
- [ ] Changer le mode vers "Direct X3" désactive immédiatement les lectures répliques sur l'ensemble de l'application sans redémarrer le serveur.
- [ ] Changer le mode vers "Réplique" réactive les lectures répliques si les tables satisfont les critères de `ReplicaGate`.
- [ ] L'état de chacune des 8 tables répliquées reflète fidèlement la fraîcheur, le nombre de lignes et le verdict de `ReplicaGate`.
- [ ] Le déclenchement d'une synchronisation manuelle met à jour la table ciblée et rafraîchit le journal d'ingestion sans bloquer le serveur.
- [ ] Les 50 derniers logs d'ingestion sont consultables avec filtrage par statut et visualisation des erreurs.

## 10. Test approach

- **Tests unitaires (`tests/unit/data_config.test.ts`)** :
  - Test de `SystemSettingsRepository` (écriture, lecture, fallback par défaut).
  - Test de `ReplicaGate.replicaReadsEnabled()` avec surcharge dynamique vs fallback `.env`.
  - Test de non-concurrence des synchronisations manuelles.
- **Tests d'intégration / contrôles de régression** :
  - `npm run typecheck` et `npm run lint`.
  - `npm run routes:gen` et `npm run routes:check` pour garantir la déclaration conforme des nouvelles routes.

## 11. Risks and tradeoffs

- **Risque d'incohérence si forcé en mode réplique périmée** : Un utilisateur pourrait s'attendre à ce que le mode réplique fonctionne même si l'ingestion est coupée.
  *Mitigation* : `ReplicaGate` garantit que l'intégrité prime sur le choix de l'utilisateur en dégradant silencieusement mais sûrement vers la voie directe X3 si la donnée est trop vieille (`MAX_AGE_MS`) ou sale. L'interface affiche l'alerte clairement.
- **Charge sur le serveur X3 lors des synchronisations manuelles** : Des déclenchements intempestifs pourraient surcharger le pool SOAP.
  *Mitigation* : Verrou global d'exécution et cooldown minimal entre deux requêtes.

## 12. Open questions

- Aucune question bloquante pour la planification.
- Optionnel pour un lot futur : Possibilité d'ajuster les seuils de fraîcheur `MAX_AGE_MS` par table directement depuis l'interface.

## 13. Out of scope

- Modification des cadences d'ingestion du cron périodique (restent configurées dans `replica_sync_provider.ts`).
- Gestion multi-tenant ou permissions granulaires par profil utilisateur (l'application utilise un modèle d'authentification unique avec scoping d'environnement).
- Modification de la structure des schémas de réplique SQLite depuis l'UI.
