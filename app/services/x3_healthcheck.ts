import { Data, Effect } from 'effect'
import { X3Connection } from '#app/x3/connection'
import type { X3SoapConfig } from '#app/x3/soap_client'
import { baseX3Config, type X3EnvName } from '#config/x3'

/**
 * Healthcheck X3 d'authentification (issue #13).
 *
 * Valide un couple identifiant/mot de passe en ouvrant une connexion SOAP vers
 * l'environnement choisi et en lisant une table métier de référence (ITMMASTER,
 * fichier articles). Lire une vraie table — plutôt que `DUAL` — prouve à la fois
 * l'authentification ET les droits de lecture SQL effectifs.
 *
 * Sécurité :
 *  - Les credentials ne sont jamais loggés.
 *  - Timeout court (`TIMEOUT_MS`) pour limiter l'énumération de comptes par
 *    analyse temporelle et éviter de bloquer le login sur un X3 lent.
 */

/** Requête triviale : une ligne du fichier articles. */
const HEALTHCHECK_SQL = 'SELECT ITMREF_0 FROM ITMMASTER WHERE ROWNUM <= 1'
const TIMEOUT_MS = 8_000
const REFUSED_REASON = 'Identifiants X3 refusés ou accès indisponible.'
const TIMEOUT_REASON = 'Connexion X3 indisponible (délai dépassé).'
const UNREACHABLE_REASON = 'Connexion X3 indisponible.'

type HealthcheckConnection = Pick<X3Connection, 'query'>

/** La requête a rejeté : cause interne, jamais affichée. */
class X3HealthcheckQueryFailed extends Data.TaggedError('X3HealthcheckQueryFailed')<{
  cause: unknown
}> {}

class X3HealthcheckTimedOut extends Data.TaggedError('X3HealthcheckTimedOut') {}

export interface X3HealthcheckResult {
  ok: boolean
  /** Message neutre, sûr à afficher (jamais de credential ni de détail interne). */
  reason: string
}

export class X3HealthcheckService {
  constructor(
    private readonly createConnection: (config: X3SoapConfig) => HealthcheckConnection = (config) =>
      new X3Connection(config),
    private readonly timeoutMs = TIMEOUT_MS
  ) {}

  /**
   * Teste les identifiants `user`/`password` sur l'environnement `env`.
   * Retourne `{ ok: true }` si la requête de référence réussit.
   */
  async check(env: X3EnvName, user: string, password: string): Promise<X3HealthcheckResult> {
    const config = { ...baseX3Config(env), user, password }
    const connection = this.createConnection(config)

    // L'interruption au timeout déclenche `signal` : curl est tué et le slot X3 rendu.
    const query = Effect.tryPromise({
      try: (signal) => connection.query(HEALTHCHECK_SQL, null, { signal }),
      catch: (cause) => new X3HealthcheckQueryFailed({ cause }),
    }).pipe(
      Effect.timeoutFail({
        duration: this.timeoutMs,
        onTimeout: () => new X3HealthcheckTimedOut(),
      })
    )

    return Effect.runPromise(
      query.pipe(
        Effect.map((result): X3HealthcheckResult =>
          result.success ? { ok: true, reason: '' } : { ok: false, reason: REFUSED_REASON }
        ),
        Effect.catchTags({
          X3HealthcheckTimedOut: () => Effect.succeed({ ok: false, reason: TIMEOUT_REASON }),
          X3HealthcheckQueryFailed: () => Effect.succeed({ ok: false, reason: UNREACHABLE_REASON }),
        })
      )
    )
  }
}
