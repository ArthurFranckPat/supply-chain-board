import { X3Connection } from '#app/x3/connection'
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

export interface X3HealthcheckResult {
  ok: boolean
  /** Message neutre, sûr à afficher (jamais de credential ni de détail interne). */
  reason: string
}

export class X3HealthcheckService {
  /**
   * Teste les identifiants `user`/`password` sur l'environnement `env`.
   * Retourne `{ ok: true }` si la requête de référence réussit.
   */
  async check(env: X3EnvName, user: string, password: string): Promise<X3HealthcheckResult> {
    const config = { ...baseX3Config(env), user, password }
    const connection = new X3Connection(config)

    try {
      const result = await this.withTimeout(connection.query(HEALTHCHECK_SQL))
      if (result.success) return { ok: true, reason: '' }
      return { ok: false, reason: 'Identifiants X3 refusés ou accès indisponible.' }
    } catch {
      return { ok: false, reason: 'Connexion X3 indisponible (délai dépassé).' }
    }
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('x3-healthcheck-timeout')), TIMEOUT_MS)
      ),
    ])
  }
}
