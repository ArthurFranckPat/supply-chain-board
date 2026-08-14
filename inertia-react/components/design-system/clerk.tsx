import { ChevronRight } from 'lucide-react'

import { Button } from '@r/components/ui/button'
import { Input } from '@r/components/ui/input'
import { Label } from '@r/components/ui/label'
import { cn } from '@r/lib/utils'

import { Caption, Demo, Panel, Section, Sub } from './kit'

/**
 * Vitrine Clerk Mosaic — assemblage des primitives Figma (Button, Input,
 * Social Button, Container, SignIn). Ne vit que sur /design-system.
 */

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.45a5.52 5.52 0 0 1-2.39 3.62v3.01h3.87c2.26-2.08 3.56-5.14 3.56-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.87-3.01c-1.08.72-2.45 1.15-4.08 1.15-3.14 0-5.8-2.12-6.75-4.97H1.27v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.25 14.26A7.2 7.2 0 0 1 4.87 12c0-.78.13-1.54.38-2.26V6.64H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.36l3.98-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.64l3.98 3.1C6.2 6.87 8.86 4.75 12 4.75Z"
      />
    </svg>
  )
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M12 .3A12 12 0 0 0 8.2 23.7c.6.1.8-.26.8-.58v-2.02c-3.34.73-4.04-1.61-4.04-1.61-.55-1.4-1.34-1.77-1.34-1.77-1.1-.75.08-.73.08-.73 1.21.09 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.5 1 .1-.78.42-1.31.76-1.61-2.66-.3-5.46-1.33-5.46-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.2.69.81.58A12 12 0 0 0 12 .3Z"
      />
    </svg>
  )
}

function AppleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M16.7 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9s-1.8-.8-3-.8c-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-.1 2.9-2.2c1.1-1.5 1.5-3 1.5-3.1-.1 0-2.8-1.1-2.8-4.4ZM14.8 5.4c.6-.8 1.1-1.9.9-3-1 .1-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.2-.5 2.9-1.4Z"
      />
    </svg>
  )
}

export function SocialButton({
  provider,
  label,
  className,
}: {
  provider: 'google' | 'github' | 'apple'
  label?: string
  className?: string
}) {
  const Mark = provider === 'google' ? GoogleMark : provider === 'github' ? GitHubMark : AppleMark
  return (
    <Button
      type="button"
      variant="outline"
      className={cn('min-w-[97px] gap-3', className)}
      aria-label={label ?? provider}
    >
      <Mark className="size-4 opacity-100" />
      {label ? <span>{label}</span> : null}
    </Button>
  )
}

export function ClerkSignInCard() {
  return (
    <div className="w-[400px] max-w-full overflow-hidden rounded-[6px] bg-muted shadow-[0_5px_15px_rgba(0,0,0,0.08),0_15px_35px_-5px_rgba(0,0,0,0.2),0_0_0_1px_rgba(0,0,0,0.06)]">
      <div className="rounded-[6px] bg-card shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col items-center gap-8 px-10 py-8">
          <div className="flex w-full flex-col items-center gap-6">
            <div className="flex size-11 items-center justify-center rounded-[6px] bg-primary text-[17px] font-bold text-primary-foreground">
              A
            </div>
            <div className="flex flex-col items-center gap-1 text-center">
              <p className="text-[17px] leading-6 font-bold tracking-[-0.17px] text-foreground">
                Sign in to Acme Co
              </p>
              <p className="text-[13px] leading-[18px] text-muted-foreground">
                Welcome back! Please sign in to continue
              </p>
            </div>
          </div>

          <div className="flex w-full flex-col items-center gap-6">
            <div className="flex w-full gap-2">
              <SocialButton provider="google" className="min-w-0 flex-1" />
              <SocialButton provider="github" className="min-w-0 flex-1" />
              <SocialButton provider="apple" className="min-w-0 flex-1" />
            </div>

            <div className="flex w-full items-center gap-4">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[13px] leading-[18px] text-muted-foreground">or</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <form
              className="flex w-full flex-col gap-8"
              onSubmit={(e) => {
                e.preventDefault()
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="clerk-email">Email address</Label>
                <Input id="clerk-email" type="email" placeholder="Enter your email address" />
              </div>
              <Button type="submit" className="w-full">
                Continue
                <ChevronRight />
              </Button>
            </form>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-8 py-4 text-[11px] leading-4 font-medium text-muted-foreground">
        <span>Secured by Clerk</span>
        <div className="flex gap-3">
          <span>Help</span>
          <span>Privacy</span>
          <span>Terms</span>
        </div>
      </div>
    </div>
  )
}

export function ClerkMosaicSection() {
  return (
    <Section
      id="mosaic"
      n="00"
      title="Clerk Mosaic"
      intro={
        <>
          Aperçu du kit community : chrome tactile (dégradé, inset, ombre 2 couches), primary{' '}
          <code className="font-mono">#372f35</code>, contrôles 32 / 24 px, rayon 6. Les primitives{' '}
          <code className="font-mono">ui/*</code> ci-dessous portent le même skin via{' '}
          <code className="font-mono">.theme-clerk</code>.
        </>
      }
    >
      <Sub title="Sign in" hint="Container + Social Button + Input + Button — nœud Figma 10:4317" />
      <Panel className="mb-6 flex justify-center bg-muted p-8">
        <ClerkSignInCard />
      </Panel>

      <Sub title="Social Button" hint="State=Default · icône seule comme sur Sign in" />
      <Demo spec="SocialButton google · github · apple — outline Clerk, h 32">
        <SocialButton provider="google" label="Google" />
        <SocialButton provider="github" label="GitHub" />
        <SocialButton provider="apple" label="Apple" />
      </Demo>

      <Caption className="mt-4">
        Source Figma : Button 33:718 · Input 33:719 · Container 1192:3660 · SignIn 10:4213
      </Caption>
    </Section>
  )
}
