import type { Component } from 'solid-js'
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { router } from '@/lib/inertia-solid'
import { Button } from '@/components/ui/button'
import { TextField, TextFieldInput, TextFieldLabel } from '@/components/ui/text-field'

interface LoginProps {
  lastUsername: string
  lastEnv: 'test' | 'prod'
  error: string | null
}

const ENVS: { value: 'test' | 'prod'; label: string }[] = [
  { value: 'test', label: 'Test' },
  { value: 'prod', label: 'Prod' },
]

/**
 * Page de login (issue #13) — direction « Atelier » du design system Papier.
 *
 * Composition split : panneau marque (encre + quadrillé) à gauche, formulaire
 * à droite. L'utilisateur saisit ses identifiants Sage X3 ; le sélecteur
 * d'environnement (Test / Prod) est discret, en haut à droite, par défaut sur
 * Production. Le serveur valide via un healthcheck X3 avant d'ouvrir la session.
 */
const Login: Component<LoginProps> = (props) => {
  const [username, setUsername] = createSignal(props.lastUsername)
  const [password, setPassword] = createSignal('')
  const [env, setEnv] = createSignal<'test' | 'prod'>(props.lastEnv)
  const [remember, setRemember] = createSignal(Boolean(props.lastUsername))
  const [submitting, setSubmitting] = createSignal(false)

  const canSubmit = createMemo(() => username().trim().length > 0 && password().length > 0)

  createEffect(() => {
    document.documentElement.dataset.env = env()
  })
  onCleanup(() => {
    delete document.documentElement.dataset.env
  })

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
    <main class="theme-papier min-h-screen bg-background text-foreground">
      <div class="mx-auto grid min-h-screen w-full max-w-5xl items-stretch md:grid-cols-[1.05fr_.95fr]">
        {/* ═══ Panneau marque ═══ */}
        <aside
          class="relative hidden flex-col justify-between overflow-hidden bg-foreground px-12 py-12 text-background md:flex"
          style={{
            'background-image':
              'linear-gradient(rgba(243,236,224,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(243,236,224,.06) 1px, transparent 1px)',
            'background-size': '26px 26px',
          }}
        >
          <div>
            <div class="font-fraunces text-[34px] font-black leading-[1.05] tracking-tight">
              Supply<br />Chain <span class="italic font-medium text-suggere">Board</span>
            </div>
            <p class="mt-4 max-w-[32ch] text-[14.5px] leading-relaxed text-muted-foreground">
              Ordonnancement &amp; suivi de production — connecté à Sage&nbsp;X3.
            </p>
          </div>
          <div class="font-mono text-[11px] tracking-wide text-muted-foreground">
            <span class="mr-2 inline-block size-[7px] rounded-full bg-ferme align-middle" />
            X3 · ITMMASTER joignable
          </div>
        </aside>

        {/* ═══ Formulaire ═══ */}
        <section class="relative flex flex-col justify-center bg-background px-8 py-12 sm:px-12">
          {/* Sélecteur d'environnement — discret, en haut à droite. */}
          <div class="absolute right-6 top-6 flex items-center gap-2">
            <span class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Env</span>
            <div class="inline-flex rounded-md border border-border bg-secondary p-[2px]">
              <For each={ENVS}>
                {(opt) => (
                  <button
                    type="button"
                    onClick={() => setEnv(opt.value)}
                    aria-pressed={env() === opt.value}
                    class="rounded-[5px] px-2.5 py-[3px] font-mono text-[10.5px] tracking-wide transition-colors"
                    classList={{
                      'bg-card text-primary font-semibold shadow-sm': env() === opt.value,
                      'text-muted-foreground hover:text-foreground': env() !== opt.value,
                    }}
                  >
                    {opt.label}
                  </button>
                )}
              </For>
            </div>
          </div>

          {/* En-tête mobile : la marque est cachée, on rappelle le nom. */}
          <div class="md:hidden">
            <div class="font-fraunces text-2xl font-black tracking-tight">
              Supply Chain <span class="italic font-medium text-primary">Board</span>
            </div>
          </div>

          <div class="mt-2 md:mt-0">
            <h1 class="font-fraunces text-[22px] font-semibold">Connexion</h1>
            <p class="mt-0.5 text-[13px] text-muted-foreground">Identifiants Sage X3</p>
          </div>

          <Show when={props.error}>
            <div
              class="mt-5 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-[13px] text-destructive"
              role="alert"
            >
              {props.error}
            </div>
          </Show>

          <form onSubmit={submit} class="mt-6 flex flex-col gap-[18px]">
            <TextField value={username()} onChange={setUsername}>
              <TextFieldLabel>Identifiant</TextFieldLabel>
              <TextFieldInput
                type="text"
                autocomplete="username"
                required
                class="h-11 bg-card text-[14px]"
              />
            </TextField>

            <TextField value={password()} onChange={setPassword}>
              <TextFieldLabel>Mot de passe</TextFieldLabel>
              <TextFieldInput
                type="password"
                autocomplete="current-password"
                required
                class="h-11 bg-card text-[14px]"
              />
            </TextField>

            <label class="flex items-center gap-2.5 text-[13px] text-muted-foreground">
              <input
                type="checkbox"
                class="size-4 accent-primary"
                checked={remember()}
                onChange={(e) => setRemember(e.currentTarget.checked)}
              />
              Se souvenir de mon identifiant et de l'environnement
            </label>

            <Button type="submit" size="lg" class="h-11 w-full" disabled={!canSubmit() || submitting()}>
              {submitting() ? 'Connexion…' : 'Se connecter'}
            </Button>
          </form>
        </section>
      </div>
    </main>
  )
}

export default Login
