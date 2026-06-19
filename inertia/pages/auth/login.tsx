import type { Component } from 'solid-js'
import { Show, createMemo, createSignal } from 'solid-js'
import { router } from '@/lib/inertia-solid'
import { Button } from '@/components/ui/button'

interface LoginProps {
  lastUsername: string
  lastEnv: 'test' | 'prod'
  error: string | null
}

/**
 * Page de login (issue #13).
 *
 * L'utilisateur saisit ses identifiants Sage X3 et choisit l'environnement
 * (Test / Prod). Le serveur valide via un healthcheck X3 avant d'ouvrir la
 * session. Garde-fou : l'accès Prod exige une confirmation explicite.
 */
const Login: Component<LoginProps> = (props) => {
  const [username, setUsername] = createSignal(props.lastUsername)
  const [password, setPassword] = createSignal('')
  const [env, setEnv] = createSignal<'test' | 'prod'>(props.lastEnv)
  const [remember, setRemember] = createSignal(Boolean(props.lastUsername))
  const [prodAck, setProdAck] = createSignal(false)
  const [submitting, setSubmitting] = createSignal(false)

  const isProd = createMemo(() => env() === 'prod')
  const canSubmit = createMemo(
    () => username().trim().length > 0 && password().length > 0 && (!isProd() || prodAck())
  )

  function submit(e: Event) {
    e.preventDefault()
    if (!canSubmit() || submitting()) return
    setSubmitting(true)
    router.post(
      '/login',
      { username: username().trim(), password: password(), env: env(), remember: remember() },
      {
        onFinish: () => {
          setSubmitting(false)
          setPassword('')
        },
      }
    )
  }

  return (
    <main class="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div class="w-full max-w-sm">
        <div class="mb-8 text-center">
          <h1 class="text-2xl font-semibold tracking-tight text-foreground">Supply Chain Board</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            Connexion avec vos identifiants Sage X3
          </p>
        </div>

        <Show when={props.error}>
          <div
            class="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {props.error}
          </div>
        </Show>

        <form onSubmit={submit} class="space-y-4">
          <div class="space-y-1.5">
            <label for="username" class="text-sm font-medium text-foreground">
              Identifiant
            </label>
            <input
              id="username"
              type="text"
              autocomplete="username"
              required
              value={username()}
              onInput={(e) => setUsername(e.currentTarget.value)}
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div class="space-y-1.5">
            <label for="password" class="text-sm font-medium text-foreground">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              autocomplete="current-password"
              required
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div class="space-y-1.5">
            <label for="env" class="text-sm font-medium text-foreground">
              Environnement
            </label>
            <select
              id="env"
              value={env()}
              onChange={(e) => {
                setEnv(e.currentTarget.value as 'test' | 'prod')
                setProdAck(false)
              }}
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="test">Test</option>
              <option value="prod">Production</option>
            </select>
          </div>

          <Show when={isProd()}>
            <label class="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-foreground">
              <input
                type="checkbox"
                class="mt-0.5"
                checked={prodAck()}
                onChange={(e) => setProdAck(e.currentTarget.checked)}
              />
              <span>
                Je confirme me connecter à l'environnement de <strong>PRODUCTION</strong>.
              </span>
            </label>
          </Show>

          <label class="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={remember()}
              onChange={(e) => setRemember(e.currentTarget.checked)}
            />
            Se souvenir de mon identifiant et de l'environnement
          </label>

          <Button type="submit" class="w-full" disabled={!canSubmit() || submitting()}>
            {submitting() ? 'Connexion…' : 'Se connecter'}
          </Button>
        </form>
      </div>
    </main>
  )
}

export default Login
