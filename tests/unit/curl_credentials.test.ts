import { test } from '@japa/runner'
import { readFileSync, statSync, existsSync } from 'node:fs'
import { writeCurlCredentials, redactCurlCommand } from '#app/x3/curl_credentials'

/**
 * Fuite d'identifiants X3 observée en production le 01/08/2026 : le mot de passe
 * `X3_PROD_*` en clair dans un WARN de `replica-sync` et dans dix lignes
 * d'`ingestion_log`.
 *
 * Cause : `-u user:password` en argument de curl. `execFile` recopie la ligne de
 * commande entière dans `error.message`, et `ps` la rend lisible par tout
 * processus de la machine pendant l'appel.
 *
 * Ces tests verrouillent les deux défenses — le fichier `-K` (le mot de passe ne
 * quitte plus le disque protégé) et la rédaction (filet, au cas où un futur
 * appel repasserait un secret en argument).
 */

const CREDS = { user: 'arthur.bledou@aereco.com', password: '@Secret2026*' }

test.group('identifiants curl — pas de fuite en ligne de commande', () => {
  test('les arguments ne contiennent QUE un chemin, jamais le secret', ({ assert }) => {
    const { args, cleanup } = writeCurlCredentials(CREDS)
    try {
      assert.equal(args[0], '-K')
      assert.notInclude(args.join(' '), CREDS.password)
      assert.notInclude(args.join(' '), CREDS.user)
    } finally {
      cleanup()
    }
  })

  test('le fichier est en 0600 — illisible par les autres utilisateurs', ({ assert }) => {
    const { args, cleanup } = writeCurlCredentials(CREDS)
    try {
      const mode = statSync(args[1]).mode & 0o777
      assert.equal(mode, 0o600)
      assert.include(readFileSync(args[1], 'utf-8'), CREDS.password)
    } finally {
      cleanup()
    }
  })

  test('cleanup efface le fichier', ({ assert }) => {
    const { args, cleanup } = writeCurlCredentials(CREDS)
    cleanup()
    assert.isFalse(existsSync(args[1]))
  })

  test('cleanup est idempotent — jamais d’échec sur un double appel', ({ assert }) => {
    const { cleanup } = writeCurlCredentials(CREDS)
    cleanup()
    assert.doesNotThrow(() => cleanup())
  })

  test('deux appels concurrents ne partagent pas leur fichier', ({ assert }) => {
    // Un nom fixe ferait qu'une requête écrase les identifiants de l'autre.
    const a = writeCurlCredentials(CREDS)
    const b = writeCurlCredentials(CREDS)
    try {
      assert.notEqual(a.args[1], b.args[1])
    } finally {
      a.cleanup()
      b.cleanup()
    }
  })

  test('config sans mot de passe → aucun argument, aucun fichier', ({ assert }) => {
    const { args } = writeCurlCredentials({ user: 'x', password: undefined })
    assert.isEmpty(args)
  })
})

test.group('rédaction des messages d’erreur curl', () => {
  test('le message réellement fuité en production est expurgé', ({ assert }) => {
    const leaked =
      'Command failed: curl -sS --max-time 120 -H Content-Type: text/xml; charset=utf-8 ' +
      '-u arthur.bledou@aereco.com:@Secret2026* -d @/tmp/x3_soap.xml http://192.168.130.77:8124/soap'

    const safe = redactCurlCommand(leaked)

    assert.notInclude(safe, CREDS.password)
    assert.notInclude(safe, CREDS.user)
    // Le reste du message doit survivre : c'est lui qui sert au diagnostic.
    assert.include(safe, '--max-time 120')
    assert.include(safe, '192.168.130.77')
  })

  test('forme longue `--user` couverte aussi', ({ assert }) => {
    assert.notInclude(redactCurlCommand('curl --user bob:hunter2 http://x'), 'hunter2')
  })

  test('identifiants intégrés à une URL', ({ assert }) => {
    const safe = redactCurlCommand('curl http://bob:hunter2@example.com/a')
    assert.notInclude(safe, 'hunter2')
    assert.include(safe, 'example.com')
  })

  test('un message sans secret est rendu intact', ({ assert }) => {
    const msg = 'curl: (28) Operation timed out after 120000 ms with 0 bytes received'
    assert.equal(redactCurlCommand(msg), msg)
  })
})
