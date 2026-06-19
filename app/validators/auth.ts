import vine from '@vinejs/vine'

/**
 * Validation du formulaire de login (issue #13).
 *
 * `env` est restreint à `test`/`prod`. `remember` ne mémorise QUE l'username +
 * l'env côté formulaire — jamais le mot de passe.
 */
export const loginValidator = vine.compile(
  vine.object({
    username: vine.string().trim().minLength(1).maxLength(80),
    password: vine.string().minLength(1).maxLength(256),
    env: vine.enum(['test', 'prod'] as const),
    remember: vine.boolean().optional(),
  })
)
