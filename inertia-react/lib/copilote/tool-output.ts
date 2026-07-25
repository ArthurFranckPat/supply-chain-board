/**
 * Lecture de l'`output` d'un tool du copilote — issue #89.
 *
 * Deux formes circulent dans le stream, et c'est volontaire :
 *  - payload nu : le tool n'a pas d'app MCP (cas général, et tout l'historique
 *    persisté avant #89) ;
 *  - enveloppe `{ __mcpUi, data }` : le tool déclare une app à afficher.
 *
 * Le chunk `tool-output-available` est validé en `strictObject` côté AI SDK : on
 * ne peut PAS ajouter un champ frère de `output`. D'où l'enveloppe, marquée
 * explicitement pour rester distinguable d'un payload métier qui aurait par
 * hasard une clé `data`.
 */

export interface ToolUiRef {
  /** Resource `ui://…` de l'app, à charger dans l'iframe hôte. */
  resourceUri: string
}

export interface ToolOutput {
  /** Payload métier — ce que l'inspecteur affiche. */
  payload: unknown
  /** App déclarée par le tool, si elle existe. */
  ui: ToolUiRef | null
}

export function readToolOutput(output: unknown): ToolOutput {
  if (output && typeof output === 'object' && '__mcpUi' in output) {
    const envelope = output as { __mcpUi?: unknown; data?: unknown }
    const ui = envelope.__mcpUi as ToolUiRef | undefined
    if (ui && typeof ui.resourceUri === 'string') {
      return { payload: envelope.data ?? null, ui }
    }
    return { payload: envelope.data ?? null, ui: null }
  }
  return { payload: output, ui: null }
}
