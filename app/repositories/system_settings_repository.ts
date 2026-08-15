import db from '@adonisjs/lucid/services/db'

export interface SystemSettingRow {
  key: string
  value: string
  updated_by: string
  updated_at: number
}

/**
 * Gestionnaire clé-valeur de paramétrage système.
 *
 * Utilise un cache mémoire local pour éviter d'interroger SQLite à chaque
 * vérification dans `ReplicaGate` sur le chemin chaud des requêtes.
 */
class SystemSettingsRepository {
  private cache = new Map<string, string>()
  private loaded = false

  /**
   * Charge l'ensemble des paramètres en mémoire.
   */
  async loadAll(): Promise<void> {
    try {
      const rows = await db.from('system_settings').select('key', 'value')
      this.cache.clear()
      for (const row of rows) {
        if (typeof row.key === 'string' && typeof row.value === 'string') {
          this.cache.set(row.key, row.value)
        }
      }
      this.loaded = true
    } catch {
      // Si la table n'existe pas encore ou la DB est inaccessible
    }
  }

  /**
   * Lecture synchrone depuis le cache mémoire (pour usage immédiat dans ReplicaGate).
   */
  getSync(key: string, defaultValue?: string): string | undefined {
    if (this.cache.has(key)) {
      return this.cache.get(key)
    }
    return defaultValue
  }

  /**
   * Lecture asynchrone (charge si non initialisé puis lit).
   */
  async get(key: string, defaultValue?: string): Promise<string | undefined> {
    if (!this.loaded) {
      await this.loadAll()
    }
    return this.getSync(key, defaultValue)
  }

  /**
   * Écriture d'un paramètre avec mise à jour du cache et de SQLite.
   */
  async set(key: string, value: string, updatedBy = 'system'): Promise<void> {
    const now = Date.now()
    this.cache.set(key, value)
    this.loaded = true

    await db
      .table('system_settings')
      .insert({
        key,
        value,
        updated_by: updatedBy,
        updated_at: now,
      })
      .onConflict('key')
      .merge({
        value,
        updated_by: updatedBy,
        updated_at: now,
      })
  }

  /**
   * Suppression d'un paramètre (retour à la valeur par défaut).
   */
  async delete(key: string): Promise<void> {
    this.cache.delete(key)
    await db.from('system_settings').where('key', key).delete()
  }

  /**
   * Vide le cache mémoire (pour les tests).
   */
  clearCache(): void {
    this.cache.clear()
    this.loaded = false
  }
}

export const systemSettingsRepository = new SystemSettingsRepository()
export default systemSettingsRepository
