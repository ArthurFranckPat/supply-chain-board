import { useState, useMemo, useEffect } from 'react'
import { Head, useForm } from '@inertiajs/react'
import { Button } from '@r/components/ui/button'
import { TextField, TextFieldInput, TextFieldLabel } from '@r/components/ui/text-field'
import { cn } from '@r/lib/utils'

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
export default function Login(props: LoginProps) {
  const [username, setUsername] = useState(props.lastUsername)
  const [password, setPassword] = useState('')
  const [env, setEnv] = useState<'test' | 'prod'>(props.lastEnv)
  const [remember, setRemember] = useState(Boolean(props.lastUsername))

  const canSubmit = useMemo(() => username.trim().length > 0 && password.length > 0, [username, password])

  const form = useForm({
    username: username.trim(),
    password,
    env,
    remember,
  })

  useEffect(() => {
    document.documentElement.dataset.env = env
    return () => {
      delete document.documentElement.dataset.env
    }
  }, [env])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || form.processing) return

    form.post('/login', {
      onFinish: () => {
        setPassword('')
      },
    })
  }

  return (
    <>
      <Head title="Connexion - Supply Chain Board" />
      <main className="theme-navy min-h-screen bg-background text-foreground">
        <div className="mx-auto grid min-h-screen w-full max-w-5xl items-stretch md:grid-cols-[1.05fr_.95fr]">
          {/* ═══ Panneau marque ═══ */}
          <aside
            className="relative hidden flex-col justify-between overflow-hidden bg-foreground px-12 py-12 text-background md:flex"
            style={{
              backgroundImage:
                'linear-gradient(rgba(243,236,224,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(243,236,224,.06) 1px, transparent 1px)',
              backgroundSize: '26px 26px',
            }}
          >
            <div>
              <div className="font-fraunces text-[34px] font-black leading-[1.05] tracking-tight">
                Supply
                <br />
                Chain <span className="italic font-medium text-suggere">Board</span>
              </div>
              <p className="mt-4 max-w-[32ch] text-[14.5px] leading-relaxed text-muted-foreground">
                Ordonnancement &amp; suivi de production — connecté à Sage&nbsp;X3.
              </p>
            </div>
            <div className="font-mono text-[11px] tracking-wide text-muted-foreground">
              <span className="mr-2 inline-block size-[7px] rounded-full bg-ferme align-middle" />
              X3 · ITMMASTER joignable
            </div>
          </aside>

          {/* ═══ Formulaire ═══ */}
          <section className="relative flex flex-col justify-center bg-background px-8 py-12 sm:px-12">
            {/* Sélecteur d'environnement — discret, en haut à droite. */}
            <div className="absolute right-6 top-6 flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Env
              </span>
              <div className="inline-flex rounded-md border border-border bg-secondary p-[2px]">
                {ENVS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEnv(opt.value)}
                    aria-pressed={env === opt.value}
                    className={cn(
                      'rounded-[5px] px-2.5 py-[3px] font-mono text-[10.5px] tracking-wide transition-colors',
                      env === opt.value
                        ? 'bg-card text-primary font-semibold shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* En-tête mobile : la marque est cachée, on rappelle le nom. */}
            <div className="md:hidden">
              <div className="font-fraunces text-2xl font-black tracking-tight">
                Supply Chain <span className="italic font-medium text-primary">Board</span>
              </div>
            </div>

            <div className="mt-2 md:mt-0">
              <h1 className="font-fraunces text-[22px] font-semibold">Connexion</h1>
              <p className="mt-0.5 text-[13px] text-muted-foreground">Identifiants Sage X3</p>
            </div>

            {props.error && (
              <div
                className="mt-5 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-[13px] text-destructive"
                role="alert"
              >
                {props.error}
              </div>
            )}

            <form onSubmit={submit} className="mt-6 flex flex-col gap-[18px]">
              <TextField value={username} onChange={setUsername}>
                <TextFieldLabel>Identifiant</TextFieldLabel>
                <TextFieldInput
                  type="text"
                  autoComplete="username"
                  required
                  className="h-11 bg-card text-[14px]"
                />
              </TextField>

              <TextField value={password} onChange={setPassword}>
                <TextFieldLabel>Mot de passe</TextFieldLabel>
                <TextFieldInput
                  type="password"
                  autoComplete="current-password"
                  required
                  className="h-11 bg-card text-[14px]"
                />
              </TextField>

              <label className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={remember}
                  onChange={(e) => setRemember(e.currentTarget.checked)}
                />
                Se souvenir de mon identifiant et de l'environnement
              </label>

              <Button
                type="submit"
                size="lg"
                className="h-11 w-full"
                disabled={!canSubmit || form.processing}
              >
                {form.processing ? 'Connexion…' : 'Se connecter'}
              </Button>
            </form>
          </section>
        </div>
      </main>
    </>
  )
}
