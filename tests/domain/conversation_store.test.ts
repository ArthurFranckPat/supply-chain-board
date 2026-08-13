import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Conversation from '#models/conversation'
import { ConversationStore } from '#services/conversation_store'

/** Deux utilisateurs distincts : le cloisonnement est la moitié du contrat du store. */
const USER = 1
const AUTRE = 2

async function seed(userId: number, conversationId: string, title: string | null) {
  await Conversation.create({
    userId,
    conversationId,
    title,
    messages: '[]',
  })
}

test.group('ConversationStore', (group) => {
  group.each.setup(async () => {
    await db.from('conversations').delete()
  })
  group.teardown(async () => {
    await db.from('conversations').delete()
  })

  test('rename met à jour le titre pour le propriétaire', async ({ assert }) => {
    await seed(USER, 'c-1', 'Ancien titre')
    const store = new ConversationStore()
    const row = await store.rename(USER, 'c-1', 'Nouveau titre')
    const reloaded = await store.get(USER, 'c-1')

    assert.isNotNull(row)
    assert.equal(row!.title, 'Nouveau titre')
    assert.equal(reloaded?.title, 'Nouveau titre')
  })

  test('rename d’une conversation d’autrui ne touche rien (anti-IDOR)', async ({ assert }) => {
    await seed(USER, 'c-1', 'Secret')
    const store = new ConversationStore()
    const row = await store.rename(AUTRE, 'c-1', 'Piraté')
    const original = await store.get(USER, 'c-1')

    assert.isNull(row)
    assert.equal(original?.title, 'Secret')
  })
})
