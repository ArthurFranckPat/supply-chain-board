import { Effect } from 'effect'
import { X3Connection } from '#app/x3/connection'
import type { X3SoapConfig } from '#app/x3/soap_client'
import type { X3QueryResult } from '#app/x3/types'
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
const TIMEOUT_REASON = 'Connexion X3 indisponible (délai dépassé).'
const CONNECTION_REASON = 'Connexion X3 indisponible.'

type HealthcheckConnection = Pick<X3Connection, 'query'>
type HealthcheckFailure =
  { _tag: 'X3HealthcheckQueryFailed'; cause: unknown } | { _tag: 'X3HealthcheckTimedOut' }

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

    const query = Effect.tryPromise<X3QueryResult, HealthcheckFailure>({
      try: (signal) => connection.query(HEALTHCHECK_SQL, null, { signal }),
      catch: (cause) => ({ _tag: 'X3HealthcheckQueryFailed', cause }),
    })
    const timedQuery = query.pipe(
      Effect.timeoutFail({
        duration: this.timeoutMs,
        onTimeout: () => ({ _tag: 'X3HealthcheckTimedOut' as const }),
      })
    )

    try {
      return await Effect.runPromise(
        Effect.match(timedQuery, {
          onFailure: (error) => ({
            ok: false,
            reason: error._tag === 'X3HealthcheckTimedOut' ? TIMEOUT_REASON : CONNECTION_REASON,
          }),
          onSuccess: (result) =>
            result.success
              ? { ok: true, reason: '' }
              : { ok: false, reason: 'Identifiants X3 refusés ou accès indisponible.' },
        })
      )
    } catch {
      // Les défauts inattendus gardent le contrat neutre du healthcheck.
      return { ok: false, reason: TIMEOUT_REASON }
    }
  }
}
