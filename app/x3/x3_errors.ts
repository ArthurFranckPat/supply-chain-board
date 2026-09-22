/**
 * Échecs typés d'une lecture SQL X3 via SOAP.
 *
 * Avant ce module, la décision « réessayer ou non » reposait sur une liste de
 * mots-clés cherchés dans le message d'erreur (`curl`, `timeout`, `resultxml is
 * nil`…). Conséquence : le message de saturation de file devait éviter ces mots
 * pour ne pas relancer une tempête de réessais, contrainte invisible au
 * typecheck. Désormais la nature de l'échec est portée par le `_tag`, et le
 * message redevient un simple texte.
 *
 * Le `message` de chaque erreur est celui qui remontait déjà dans
 * `X3QueryResult.error` : les appelants ne voient aucune différence.
 */

import { Data } from 'effect'
import type { X3QueueSaturatedError } from './x3_concurrency.js'

/** curl a échoué avant d'obtenir une réponse (réseau, `--max-time`, process tué). */
export class X3CurlFailed extends Data.TaggedError('X3CurlFailed')<{ message: string }> {}

/** Syracuse a répondu sans `resultXml` : incident connu du pool, transitoire. */
export class X3ResultXmlNil extends Data.TaggedError('X3ResultXmlNil')<{
  message: string
  status: number | null
}> {}

/** Syracuse a répondu en échec : erreur SQL, JSON illisible, statut ≠ 1. */
export class X3Fault extends Data.TaggedError('X3Fault')<{
  message: string
  status: number | null
}> {}

export type X3SoapError = X3CurlFailed | X3ResultXmlNil | X3Fault | X3QueueSaturatedError

/**
 * Seul reste de l'ancienne liste de mots-clés : le texte d'une `X3Fault` vient
 * de Syracuse, qui peut signaler lui-même un délai ou une connexion perdue.
 */
const TRANSIENT_FAULT_KEYWORDS = ['timeout', 'connection', 'refused', 'econnrefused']

/**
 * Faut-il réessayer ?
 *
 * Une file saturée ne l'est JAMAIS : le réessai remettrait l'appelant au bout de
 * la file, précisément parce qu'elle est trop longue (#183).
 */
export function isTransient(error: X3SoapError): boolean {
  switch (error._tag) {
    case 'X3CurlFailed':
    case 'X3ResultXmlNil':
      return true
    case 'X3QueueSaturated':
      return false
    case 'X3Fault': {
      const message = error.message.toLowerCase()
      return TRANSIENT_FAULT_KEYWORDS.some((keyword) => message.includes(keyword))
    }
  }
}
