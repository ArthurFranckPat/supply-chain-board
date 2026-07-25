/**
 * Pont schéma TypeBox (JSON Schema) → shape zod, pour le `McpServer` high-level.
 *
 * POURQUOI CE MODULE EXISTE — et pourquoi il n'est pas un caprice :
 * les tools agent déclarent leurs paramètres en TypeBox (`app/services/agent/tools.ts`),
 * qui **est** du JSON Schema. Le `Server` low-level du SDK MCP acceptait ce JSON
 * Schema tel quel, d'où le choix initial du low-level (cf. bin/mcp_supply.ts).
 * Mais `registerAppTool` / `registerAppResource` de `@modelcontextprotocol/ext-apps`
 * n'existent que sur le `McpServer` high-level, dont `inputSchema` n'accepte que du
 * **zod** (`getZodSchemaObject` throw « inputSchema must be a Zod schema or raw shape »
 * sur tout le reste — vérifié dans le dist du SDK 1.29 ; la seule autre porte,
 * `StandardSchemaWithJSON`, est typée par ext-apps mais pas encore implémentée côté SDK,
 * et TypeBox 1.1 n'expose de toute façon pas `~standard`).
 *
 * Donc : TypeBox reste la source de vérité (une seule déclaration par tool, partagée
 * app copilote / MCP), et on en dérive une shape zod pour l'annonce `tools/list` et la
 * validation d'entrée du SDK.
 *
 * Règle de sûreté : ce convertisseur ne couvre QUE le sous-ensemble JSON Schema
 * réellement utilisé par les tools. Toute construction non gérée lève au boot du
 * serveur MCP — jamais silencieusement, jamais en dégradant un schéma en `unknown`
 * (un schéma laxiste laisserait passer des arguments invalides jusque dans les
 * primitives, qui ressortiraient en erreur moteur incompréhensible).
 */

import { z } from 'zod'

/** Nœud JSON Schema tel que produit par TypeBox. */
export type JsonSchemaNode = {
  type?: string
  description?: string
  properties?: Record<string, JsonSchemaNode>
  required?: string[]
  items?: JsonSchemaNode
  enum?: unknown[]
  const?: unknown
  [k: string]: unknown
}

/** Shape zod (`{ champ: ZodType }`) telle que l'attend `registerTool`. */
export type ZodShape = Record<string, z.ZodType>

function fail(path: string, reason: string): never {
  throw new Error(
    `[mcp_schema] Schéma TypeBox non convertible en zod à "${path}" : ${reason}. ` +
      'Étendre jsonSchemaToZodShape (app/services/agent/mcp_schema.ts) ou simplifier le schéma du tool.'
  )
}

function nodeToZod(node: JsonSchemaNode, path: string): z.ZodType {
  let base: z.ZodType

  // Type.Any() / Type.Unknown() sérialisent en `{}` : aucun type, tout est valide.
  // Volontairement permissif ici — c'est ce que le tool a déclaré.
  if (node.type === undefined) {
    if (Array.isArray(node.anyOf) || Array.isArray(node.oneOf) || Array.isArray(node.allOf)) {
      fail(path, 'combinateur anyOf/oneOf/allOf non géré')
    }
    base = z.unknown()
  } else if (node.type === 'string') {
    if (Array.isArray(node.enum)) {
      const values = node.enum.filter((v): v is string => typeof v === 'string')
      if (values.length !== node.enum.length) fail(path, 'enum de chaînes attendu')
      base = z.enum(values as [string, ...string[]])
    } else {
      base = z.string()
    }
  } else if (node.type === 'number' || node.type === 'integer') {
    base = node.type === 'integer' ? z.number().int() : z.number()
  } else if (node.type === 'boolean') {
    base = z.boolean()
  } else if (node.type === 'array') {
    base = z.array(nodeToZod(node.items ?? {}, `${path}[]`))
  } else if (node.type === 'object') {
    base = z.object(shapeOf(node, path))
  } else {
    fail(path, `type "${node.type}" non géré`)
  }

  // La description est le seul canal d'explication d'un paramètre vers le modèle :
  // la perdre dégrade l'usage du tool bien plus qu'une erreur de type.
  return node.description ? base.describe(node.description) : base
}

function shapeOf(schema: JsonSchemaNode, path: string): ZodShape {
  const properties = schema.properties ?? {}
  const required = new Set(schema.required ?? [])
  const shape: ZodShape = {}
  for (const [key, prop] of Object.entries(properties)) {
    const field = nodeToZod(prop, `${path}.${key}`)
    // TypeBox `Type.Optional(...)` ne marque rien sur le nœud : il retire la clé
    // de `required`. L'absence de `required` = tout est optionnel.
    shape[key] = required.has(key) ? field : field.optional()
  }
  return shape
}

/**
 * Convertit le schéma de paramètres d'un tool (TypeBox `Type.Object`) en shape zod.
 *
 * @param schema schéma racine, attendu de type `object`
 * @param label nom du tool, pour situer une erreur de conversion au boot
 */
export function jsonSchemaToZodShape(schema: JsonSchemaNode | undefined, label: string): ZodShape {
  if (!schema) return {}
  if (schema.type !== undefined && schema.type !== 'object') {
    fail(label, `racine de type "${schema.type}" — un Type.Object est attendu`)
  }
  return shapeOf(schema, label)
}
