import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import encryption from '@adonisjs/core/services/encryption'
import type { X3EnvName } from '#config/x3'
import {
  DEFAULT_DASHBOARD_LAYOUT,
  normalizeDashboardLayout,
  type DashboardLayout,
} from '#types/dashboard_layout'

/**
 * Utilisateur applicatif (issue #13).
 *
 * L'autorité d'authentification est Sage X3 : pas de hash de mot de passe
 * local. On stocke les identifiants X3 **chiffrés au repos** (AES-256-GCM via
 * `APP_KEY`) pour permettre la reconnexion sans re-saisie, ainsi que le dernier
 * environnement choisi. Le mot de passe n'est JAMAIS persisté en clair ni loggé.
 *
 * Le username est l'identité stable (clé d'auto-provisioning au 1er login).
 */
export default class User extends BaseModel {
  static table = 'users'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare username: string

  /**
   * Mot de passe X3 chiffré (AES-256-GCM). Sérialisé hors des réponses JSON.
   * Utiliser `setX3Password()` / `getX3Password()` plutôt que la colonne brute.
   */
  // columnName explicite : la stratégie snake_case de Lucid transforme
  // `x3PasswordEncrypted` en `x_3_password_encrypted` (le chiffre coupe le mot).
  // On force le nom réel de la colonne créée par la migration.
  @column({ columnName: 'x3_password_encrypted', serializeAs: null })
  declare x3PasswordEncrypted: string | null

  @column()
  declare lastEnv: X3EnvName

  @column.dateTime()
  declare lastLoginAt: DateTime | null

  /**
   * Disposition du tableau de bord de l'utilisateur (JSON sérialisé).
   * `null` tant que l'utilisateur n'a rien personnalisé → `getDashboardLayout()`
   * retourne alors `DEFAULT_DASHBOARD_LAYOUT`. Toujours relire via le getter.
   */
  @column({ columnName: 'dashboard_layout' })
  declare dashboardLayoutRaw: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /** Chiffre et stocke le mot de passe X3 (au repos uniquement). */
  setX3Password(plain: string): void {
    this.x3PasswordEncrypted = encryption.encrypt(plain)
  }

  /** Déchiffre le mot de passe X3 stocké. `null` si absent ou clé invalide. */
  getX3Password(): string | null {
    if (!this.x3PasswordEncrypted) return null
    return encryption.decrypt<string>(this.x3PasswordEncrypted)
  }

  /**
   * Lit le layout du tableau de bord (toujours un objet valide, jamais `null`).
   * Robuste aux évolutions du registre des KPI : normalise et complète les
   * entrées manquantes avec les valeurs par défaut.
   */
  getDashboardLayout(): DashboardLayout {
    if (!this.dashboardLayoutRaw) return structuredClone(DEFAULT_DASHBOARD_LAYOUT)
    try {
      return normalizeDashboardLayout(JSON.parse(this.dashboardLayoutRaw))
    } catch {
      return structuredClone(DEFAULT_DASHBOARD_LAYOUT)
    }
  }

  /** Sérialise et persiste le layout du tableau de bord. */
  setDashboardLayout(layout: DashboardLayout): void {
    this.dashboardLayoutRaw = JSON.stringify(normalizeDashboardLayout(layout))
  }
}
