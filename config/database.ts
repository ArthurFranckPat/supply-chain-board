import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/lucid'

const dbConfig = defineConfig({
  connection: 'sqlite',

  connections: {
    sqlite: {
      client: 'sqlite3',

      connection: {
        filename: app.tmpPath('db.sqlite3'),
      },

      /**
       * Required by Knex for SQLite defaults.
       */
      useNullAsDefault: true,

      migrations: {
        /**
         * Sort migration files naturally by filename.
         */
        naturalSort: true,

        /**
         * Paths containing migration files.
         */
        paths: ['database/migrations'],
      },

      schemaGeneration: {
        /**
         * Enable schema generation from Lucid models.
         */
        enabled: true,

        /**
         * Custom schema rules file paths.
         */
        rulesPaths: ['./database/schema_rules.js'],
      },
    },

    /**
     * X3 Oracle via SOAP/SQL — custom dialect.
     * Read-only. No migrations.
     */
    x3: {
      client: 'x3' as any,
      connection: {
        env: env.get('X3_ENV', 'test'),
        host: env.get('X3_TEST_HOST'),
        port: env.get('X3_TEST_PORT', '8124'),
        user: env.get('X3_TEST_USERNAME', ''),
        password: env.get('X3_TEST_PASSWORD', ''),
        pool: env.get('X3_TEST_POOL', 'X3TEST'),
      } as any,
      // max>1 : permet aux requêtes d'un Promise.all de partir en parallèle
      // (SOAP Syracuse supporte la concurrence) au lieu d'être sérialisées.
      pool: { min: 1, max: 4 },

      /**
       * ALIGNÉ sur la durée maximale réelle d'une requête, et non laissé au
       * défaut knex de 60 s (#183).
       *
       * Une requête X3 peut légitimement retenir son slot 250 s : `soap_client`
       * lance curl avec `--max-time 120` sous un `execFile timeout` de 125 s, et
       * `connection.ts` réessaie une fois (`retries = 1`, donc DEUX tentatives).
       * Avec le défaut à 60 s, tout ce qui attendait derrière mourait avant même
       * que le slot ne se libère — sans jamais atteindre X3. Constaté le
       * 01/09/2026 : une requête à 200 en 1,9 s, puis 62 s plus tard quatre
       * `Acquire connection error: operation timed out` simultanés
       * (`getStockFlows` + les trois requêtes emplacement de `SuiviService`).
       *
       * Le pool ne pouvait pas se vider assez vite PAR CONSTRUCTION : la borne
       * d'attente était deux à quatre fois plus courte que le travail attendu.
       * Ce n'était pas un symptôme de la santé de X3.
       *
       * Attendre plutôt qu'échouer est le bon arbitrage ici : les lectures
       * passent par bentocache en SWR (`timeout: 0`), donc un appelant qui a une
       * valeur en grâce est servi INSTANTANÉMENT et c'est le refresh d'arrière-
       * plan qui attend. Le mur de 250 s ne concerne que les chemins réellement
       * froids.
       *
       * Si cette valeur change, changer `--max-time` avec elle : c'est le couple
       * qui doit rester cohérent, pas chaque nombre pris isolément.
       */
      acquireConnectionTimeout: 250_000,
    } as any,

    /**
     * PostgreSQL connection.
     * Install package to switch: npm install pg
     */
    // pg: {
    //   client: 'pg',
    //   connection: {
    //     host: env.get('DB_HOST'),
    //     port: env.get('DB_PORT'),
    //     user: env.get('DB_USER'),
    //     password: env.get('DB_PASSWORD'),
    //     database: env.get('DB_DATABASE'),
    //   },
    //   migrations: {
    //     naturalSort: true,
    //     paths: ['database/migrations'],
    //   },
    //   debug: app.inDev,
    // },

    /**
     * MySQL / MariaDB connection.
     * Install package to switch: npm install mysql2
     */
    // mysql: {
    //   client: 'mysql2',
    //   connection: {
    //     host: env.get('DB_HOST'),
    //     port: env.get('DB_PORT'),
    //     user: env.get('DB_USER'),
    //     password: env.get('DB_PASSWORD'),
    //     database: env.get('DB_DATABASE'),
    //   },
    //   migrations: {
    //     naturalSort: true,
    //     paths: ['database/migrations'],
    //   },
    //   debug: app.inDev,
    // },

    /**
     * Microsoft SQL Server connection.
     * Install package to switch: npm install tedious
     */
    // mssql: {
    //   client: 'mssql',
    //   connection: {
    //     server: env.get('DB_HOST'),
    //     port: env.get('DB_PORT'),
    //     user: env.get('DB_USER'),
    //     password: env.get('DB_PASSWORD'),
    //     database: env.get('DB_DATABASE'),
    //   },
    //   migrations: {
    //     naturalSort: true,
    //     paths: ['database/migrations'],
    //   },
    //   debug: app.inDev,
    // },

    /**
     * libSQL (Turso) connection.
     * Install package to switch: npm install @libsql/client
     */
    // libsql: {
    //   client: 'libsql',
    //   connection: {
    //     url: env.get('LIBSQL_URL'),
    //     authToken: env.get('LIBSQL_AUTH_TOKEN'),
    //   },
    //   useNullAsDefault: true,
    //   migrations: {
    //     naturalSort: true,
    //     paths: ['database/migrations'],
    //   },
    //   debug: app.inDev,
    // },
  },
})

export default dbConfig
