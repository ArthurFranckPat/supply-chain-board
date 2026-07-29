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
     * Réplique locale des données opérationnelles X3 (issue #98, lot 1).
     *
     * FICHIER SÉPARÉ de `db.sqlite3`, et ce n'est pas un détail : SQLite n'admet
     * qu'un écrivain par fichier. Une ingestion — 14 k lignes ORDERS + 7 k lignes
     * STOCK dans une seule transaction — bloquerait sinon toutes les écritures
     * applicatives le temps du swap (scénarios, `print_jobs`, overrides).
     *
     * Un seul écrivain (l'ingestion), beaucoup de lecteurs : cas d'usage nominal
     * de SQLite en WAL. Les lecteurs ne voient l'ancienne version que jusqu'au
     * COMMIT, donc jamais d'écran vide pendant l'ingestion.
     *
     * Migrations dans un dossier à part : le `migration:run` par défaut cible la
     * connexion `sqlite`, appliquer les deux jeux au même fichier créerait les
     * tables de réplique dans la base applicative.
     */
    replica: {
      client: 'sqlite3',

      connection: {
        filename: app.tmpPath('replica.sqlite3'),
      },

      useNullAsDefault: true,

      /**
       * `journal_mode=WAL` : les lecteurs ne bloquent pas l'écrivain, et
       * réciproquement — sans quoi une lecture pendant le swap prendrait un
       * `SQLITE_BUSY`.
       *
       * `busy_timeout` : marge d'attente au lieu d'un échec immédiat quand le
       * verrou d'écriture est pris. 5 s couvre largement un swap de 21 k lignes.
       *
       * `afterCreate` et pas une migration : ces pragmas sont par CONNEXION
       * (`busy_timeout`) ou persistants mais à reposer si le fichier est recréé
       * (`journal_mode`). Une migration ne les rejouerait pas.
       */
      /**
       * `max: 4` et NON 1 : la transaction de swap retient une connexion du pool
       * pendant toute sa durée. Avec un pool de 1, les lectures attendraient
       * derrière elle — exactement la propriété qu'on cherche à obtenir
       * (« les lecteurs voient l'ancienne version pendant l'ingestion »)
       * annulée par la file d'attente du pool. WAL autorise les lecteurs
       * concurrents, encore faut-il leur donner des connexions.
       */
      pool: {
        min: 1,
        max: 4,
        afterCreate: (conn: any, done: (err?: Error) => void) => {
          conn.run('PRAGMA journal_mode = WAL', (walErr: Error | null) => {
            if (walErr) return done(walErr)
            conn.run('PRAGMA busy_timeout = 5000', (busyErr: Error | null) =>
              done(busyErr ?? undefined)
            )
          })
        },
      },

      migrations: {
        naturalSort: true,
        paths: ['database/replica_migrations'],
      },

      /**
       * DÉSACTIVÉE, et c'est indispensable. `database/schema.ts` est un fichier
       * unique, régénéré à partir de la connexion sur laquelle tourne
       * `migration:run`. Laissée active, un `migration:run --connection=replica`
       * écrase les classes de la base applicative par celles de la réplique —
       * constaté : les 4 tables de réplique avaient remplacé les 20 tables de
       * l'app. Un fichier généré, donc récupérable par un `migration:run` sur la
       * connexion par défaut, mais le piège est silencieux.
       */
      schemaGeneration: {
        enabled: false,
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
