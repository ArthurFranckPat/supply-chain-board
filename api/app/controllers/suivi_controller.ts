import { HttpContext } from '@adonisjs/core/http'

export default class SuiviController {
  async assign({}: HttpContext) { return { total_rows: 0, status_counts: {} } }
  async fromLatestExport({}: HttpContext) { return { total_rows: 0, status_counts: {} } }
  async statusDetail({ params }: HttpContext) { return { no_commande: params.noCommande } }
  async palette({}: HttpContext) { return { lignes: [], totaux: {} } }
  async retardCharge({}: HttpContext) { return { items: [], total_heures: 0 } }
}
