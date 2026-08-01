import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * Identifiants curl passés par FICHIER, jamais en ligne de commande.
 *
 * ## Ce que `-u user:password` expose, et à qui
 *
 * 1. **`ps`** — la ligne de commande d'un processus est lisible par n'importe
 *    quel autre processus de la machine, pendant toute la durée de l'appel.
 *    Vrai à CHAQUE requête, y compris celles qui réussissent.
 * 2. **Les logs applicatifs** — `execFile` recopie la ligne de commande entière
 *    dans `error.message` (« Command failed: curl -sS … -u user:pass … »). Quand
 *    `stderr` est vide, c'est ce message qui remonte, est journalisé, et finit
 *    dans `ingestion_log.error`, donc sur disque et sans expiration.
 * 3. **L'historique du shell** et les traces de crash, par ricochet.
 *
 * Observé en production le 01/08/2026 : le mot de passe `X3_PROD_*` en clair
 * dans un WARN de `replica-sync` et dans dix lignes d'`ingestion_log`.
 *
 * ## Le correctif
 *
 * `-K <fichier>` : curl lit `user = "..."` depuis un fichier en 0600, dans un
 * répertoire temporaire propre à l'appel. La ligne de commande ne contient plus
 * que le CHEMIN du fichier — inutile sans les droits de lecture, et effacé dès
 * la réponse reçue.
 *
 * Un répertoire par appel (`mkdtemp`) et non un nom fixe : deux requêtes
 * concurrentes écraseraient sinon le fichier l'une de l'autre.
 *
 * `redactCurlCommand()` reste appliqué aux messages d'erreur MALGRÉ ce
 * correctif. Deux raisons : une seconde ligne de défense ne coûte rien face à
 * une fuite d'identifiants, et rien n'empêche un futur appel de repasser un
 * secret en argument.
 */

export interface CurlCredentials {
  user: string | undefined
  password: string | undefined
}

export interface CurlCredentialFile {
  /** Arguments curl à insérer — `['-K', '<chemin>']`, ou `[]` sans identifiants. */
  args: string[]
  /** À appeler dans un `finally`. Idempotent, n'échoue jamais. */
  cleanup: () => void
}

/**
 * Écrit les identifiants dans un fichier temporaire et rend les arguments curl
 * correspondants.
 *
 * Sans identifiants (config incomplète), rend `[]` : curl part sans
 * authentification et X3 répondra une erreur explicite, ce qui vaut mieux qu'un
 * fichier vide qui produirait un échec plus obscur.
 */
export function writeCurlCredentials(config: CurlCredentials): CurlCredentialFile {
  if (!config.user || !config.password) return { args: [], cleanup: () => {} }

  const dir = mkdtempSync(join(tmpdir(), 'x3_cred_'))
  const file = join(dir, 'curl.conf')
  // `mode` à la création ET non un chmod après coup : entre les deux, le fichier
  // serait lisible par tous.
  //
  // Guillemets autour de la valeur : curl les exige dès que le mot de passe
  // contient un espace, et les tolère toujours. Les backslashes et guillemets
  // internes sont échappés — c'est la syntaxe des fichiers de config curl, pas
  // celle du shell (aucun shell n'intervient ici).
  const escaped = `${config.user}:${config.password}`.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  writeFileSync(file, `user = "${escaped}"\n`, { encoding: 'utf-8', mode: 0o600 })

  return {
    args: ['-K', file],
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // Un temp non nettoyé ne doit jamais faire échouer une requête réussie.
      }
    },
  }
}

/**
 * Retire tout secret d'un message d'erreur avant journalisation.
 *
 * `execFile` recopie la ligne de commande dans `error.message`. Même si plus
 * aucun appel ne passe `-u`, ce filet reste en place : une fuite d'identifiants
 * ne se rattrape pas après coup, et le coût d'un `replace` est nul.
 *
 * Couvre `-u user:pass` / `--user user:pass` (forme collée ou séparée) et les
 * URLs à identifiants intégrés (`http://user:pass@hôte`).
 */
export function redactCurlCommand(message: string): string {
  return message
    .replace(/(-u|--user)(\s+|=)\S+/g, '$1 ***')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi, '$1***:***@')
}
