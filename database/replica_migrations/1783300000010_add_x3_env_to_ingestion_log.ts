import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Environnement X3 d'où provient l'ingestion (`test` | `prod`).
 *
 * Sans cette colonne, la réplique est muette sur sa PROVENANCE — et c'est un
 * trou de sécurité fonctionnelle, pas une coquetterie d'observabilité.
 *
 * `getX3EnvConfig()` (`config/x3.ts`) résout l'environnement en deux temps :
 * les credentials de la session HTTP s'il y en a, sinon la variable `X3_ENV`.
 * Or les deux chemins de #98 ne sont pas du même côté de cette bascule :
 *
 * - l'INGESTION tourne dans le provider et en CLI, donc HORS contexte HTTP →
 *   toujours `X3_ENV` ;
 * - les LECTURES tournent dans une requête → l'environnement de l'utilisateur
 *   connecté.
 *
 * Un `X3_ENV=test` avec un utilisateur connecté en prod — configuration
 * observée en développement — remplit donc la réplique depuis CLTEST et la sert
 * à une session prod. Aucun écran ne signale quoi que ce soit : les chiffres
 * sont plausibles, simplement faux.
 *
 * La colonne permet à `ReplicaGate` de comparer la provenance de la dernière
 * ingestion à l'environnement du lecteur et de refuser en cas d'écart, comme il
 * refuse déjà une donnée périmée ou salie par une écriture.
 *
 * Défaut `test` pour l'existant : c'est ce qu'a produit `X3_ENV=test`, la seule
 * valeur utilisée jusqu'ici. Un défaut faux dans l'autre sens ferait servir du
 * test à de la prod — exactement ce que cette migration existe pour empêcher.
 */
export default class extends BaseSchema {
  protected tableName = 'ingestion_log'

  async up() {
    this.schema.raw(`ALTER TABLE ${this.tableName} ADD COLUMN x3_env TEXT NOT NULL DEFAULT 'test'`)
  }

  async down() {
    this.schema.raw(`ALTER TABLE ${this.tableName} DROP COLUMN x3_env`)
  }
}
