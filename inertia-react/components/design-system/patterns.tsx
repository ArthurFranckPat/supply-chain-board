import { ExternalLink, TrendingDown, TrendingUp } from 'lucide-react'

import { BoardCard, type CardStatus } from '@r/components/board/board-card'
import { X3Link } from '@r/components/x3-link'
import { Badge } from '@r/components/ui/badge'
import { Card, CardContent } from '@r/components/ui/card'
import { cn } from '@r/lib/utils'

import { Caption, Etat, Fiche, Grid, Panel, Rule, Section, SpecTable, Sub, Tok } from './kit'

/**
 * Motifs applicatifs : les compositions qui portent le sens métier.
 * Ce ne sont pas des primitives — ce sont les objets que l'utilisateur
 * reconnaît d'une page à l'autre.
 */

/* ── 19 Alphabets de statut ─────────────────────────────────── */

const STATUTS: { key: CardStatus; label: string; sens: string; token: string }[] = [
  { key: 'ferme', label: 'Ferme', sens: 'lancé, engagé en atelier', token: '--ferme' },
  {
    key: 'planifie',
    label: 'Planifié',
    sens: 'calé par le CBN, pas encore lancé',
    token: '--planifie',
  },
  { key: 'suggere', label: 'Suggéré', sens: 'proposé par le CBN, non validé', token: '--suggere' },
  { key: 'cours', label: 'En cours', sens: 'production démarrée', token: '--brand' },
  { key: 'termine', label: 'Terminé', sens: 'soldé — atténué', token: '--muted-foreground' },
  { key: 'bloque', label: 'Bloqué', sens: 'rupture composant', token: '--destructive' },
]

const VERDICTS_IMPACT = [
  { key: 'ok', label: 'À l’heure', couleur: '#007041', token: 'border-l-ferme' },
  { key: 'limite', label: 'Limite', couleur: '#a46700', token: 'border-l-suggere' },
  { key: 'retard', label: 'En retard', couleur: '#be1744', token: 'border-l-destructive' },
  {
    key: 'unknown',
    label: 'Non évalué',
    couleur: 'color-mix(in oklab, #141414 45%, transparent)',
    token: 'border-l-muted-foreground/45',
  },
]

const VERDICTS_SERVABILITE = [
  { key: 'on_time', label: 'À temps', couleur: '#f54e00' },
  { key: 'stock', label: 'À temps (stock)', couleur: '#f54e00' },
  { key: 'sans_couverture', label: 'Sans couverture', couleur: '#a46700' },
  { key: 'retard', label: 'Retard', couleur: '#be1744' },
  { key: 'bloquee', label: 'Bloquée', couleur: '#be1744' },
]

function Tone({ couleur, label }: { couleur: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-4 w-1 shrink-0 rounded-full" style={{ background: couleur }} aria-hidden />
      <span className="text-[13px] text-[#141414]">{label}</span>
    </span>
  )
}

export function StatutsSection() {
  return (
    <Section
      id="statuts"
      n="19"
      title="Alphabets de statut"
      intro={
        <>
          Trois alphabets coexistent, volontairement non fusionnés : le <strong>statut</strong> d’un
          OF, le <strong>verdict d’impact</strong> d’une commande, la <strong>servabilité</strong>{' '}
          d’une ligne de board. Ils répondent à trois questions différentes et n’ont pas les mêmes
          clés — les unifier ferait dire à une couleur deux choses à la fois.
        </>
      }
    >
      <Fiche
        nom="Statut d’ordre"
        from="board/board-card · CardStatus"
        etat="airbnb"
        note="Porté par le liseré supérieur de la carte (3 px) et par la bande « Listing » de la variante OF."
      >
        <Panel padding="none">
          <SpecTable
            head={['Statut', 'Sens métier', 'Token']}
            rows={STATUTS.map((s) => [
              <Tone couleur={`var(${s.token}, #141414)`} label={s.label} />,
              s.sens,
              <span className="font-mono text-[12px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
                {s.token}
              </span>,
            ])}
          />
        </Panel>
      </Fiche>

      <Fiche
        nom="Verdict d’impact"
        from="lib/vision/verdict-tones"
        etat="airbnb"
        note={
          <>
            Liseré <strong>gauche</strong> du marqueur commande. Le vert code « à l’heure » — le
            brand n’est jamais utilisé pour dire « ok », ce serait une collision sémantique avec
            l’interaction.
          </>
        }
      >
        <Panel padding="none">
          <SpecTable
            head={['Verdict', 'Libellé', 'Classe']}
            rows={VERDICTS_IMPACT.map((v) => [
              <Tone couleur={v.couleur} label={v.key} />,
              v.label,
              <span className="font-mono text-[12px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
                {v.token}
              </span>,
            ])}
          />
        </Panel>
        <div className="mt-3">
          <Rule kind="dont">
            Faire retomber un verdict <Tok>null</Tok> sur le ton « ok ». Non évalué est un état à
            part entière, en neutre.
          </Rule>
        </div>
      </Fiche>

      <Fiche
        nom="Servabilité"
        from="board/board-grid · VERDICT_TONE"
        etat="airbnb"
        note="Alphabet de la rangée « commandes virtuelles » du board. Cinq clés métier propres, distinctes du verdict d'impact."
      >
        <Panel padding="none">
          <SpecTable
            head={['Clé', 'Libellé affiché']}
            rows={VERDICTS_SERVABILITE.map((v) => [
              <span className="font-mono text-[12px] text-[#141414]">{v.key}</span>,
              <Tone couleur={v.couleur} label={v.label} />,
            ])}
          />
        </Panel>
      </Fiche>

      <Sub
        title="Deux canaux visuels sur une même carte"
        hint="ils ne se recouvrent jamais"
        className="mt-8"
      />
      <Grid min={280}>
        <Panel>
          <Caption className="mb-2">Liseré haut</Caption>
          <p className="text-[13px] leading-[18px] text-[color-mix(in_oklab,#141414_74%,transparent)]">
            Statut de l’ordre : ferme, planifié, suggéré. Répond à « où en est cet OF dans le
            processus ».
          </p>
        </Panel>
        <Panel>
          <Caption className="mb-2">Liseré gauche</Caption>
          <p className="text-[13px] leading-[18px] text-[color-mix(in_oklab,#141414_74%,transparent)]">
            Verdict d’impact : à l’heure, limite, en retard. Répond à « est-ce que le client sera
            servi ».
          </p>
        </Panel>
      </Grid>
    </Section>
  )
}

/* ── 20 Carte de board ──────────────────────────────────────── */

export function BoardCardSection() {
  return (
    <Section
      id="board-card"
      n="20"
      title="Carte de board"
      intro={
        <>
          L’objet le plus dense de l’application : un OF ou une ligne de commande tenant dans 160 px
          de large, lisible en un coup d’œil sur une grille de quinze colonnes. Deux variantes, un
          seul composant.
        </>
      }
    >
      <Fiche
        nom="BoardCard — variante OF"
        from="@r/components/board/board-card"
        etat="airbnb"
        note="Carte « Listing » : la bande colorée en haut tient lieu de photo, le n° d'OF est l'ancre, la charge se lit au pied. Badge de faisabilité au coin."
      >
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
        >
          {STATUTS.map((s, i) => (
            <BoardCard
              key={s.key}
              variant="of"
              status={s.key}
              article={`F126-445${10 + i}`}
              articleRef="PP830"
              title="Caisson VMC double flux D250"
              poste="MONT-2"
              hours="6,0 h"
              progress={{ done: 40 + i * 10, total: 120 }}
              feas={s.key === 'bloque' ? 'bad' : s.key === 'suggere' ? 'qc' : 'ok'}
              alert={s.key === 'bloque' ? 'BDH60 — 270 u manquantes' : undefined}
            />
          ))}
        </div>
        <div className="mt-3 font-mono text-[10px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
          feas : ok ✓ réalisable · qc ⚗ tributaire du contrôle qualité · bad ! rupture
        </div>
      </Fiche>

      <Fiche
        nom="BoardCard — variante commande"
        from="@r/components/board/board-card"
        etat="airbnb"
        note={
          <>
            Coquille historique à liseré de 3 px. La prop <Tok>nature</Tok> est obligatoire : sans
            elle, le lien X3 tomberait en silence, et l’oubli doit se voir au typecheck.
          </>
        }
      >
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
        >
          <BoardCard
            variant="commande"
            status="ferme"
            article="PP830"
            title="Caisson VMC D250"
            ord="AR24518·L2"
            client="Aldes Distribution"
            type="MTS"
            nature="COMMANDE"
            hours="6,0 h"
            qty={120}
            feas="ok"
          />
          <BoardCard
            variant="commande"
            status="suggere"
            article="BDH60"
            title="Bouche hygro 60"
            ord="AR24601·L1"
            client="Négoce Sud"
            type="MTO"
            nature="COMMANDE"
            hours="3,7 h"
            qty={1240}
            feas="qc"
            mod
          />
          <BoardCard
            variant="commande"
            status="bloque"
            article="ESH10"
            title="Entrée d’air standard"
            ord="AR24610·L3"
            client="Grand compte"
            type="NOR"
            nature="PREVISION"
            hours="1,2 h"
            qty={96}
            feas="bad"
          />
          <BoardCard
            variant="commande"
            status="planifie"
            article="D250"
            title="Conduit rigide Ø250"
            ord="AR24622·L1"
            nature="INDUIT"
            hours="9,4 h"
            qty={480}
            induit
          />
        </div>
        <div className="mt-3 font-mono text-[10px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
          mod → liseré brand (override local) · induit → fond hachuré, non déplaçable
        </div>
      </Fiche>
    </Section>
  )
}

/* ── 21 KPI ─────────────────────────────────────────────────── */

const KPIS = [
  { titre: 'OTIF', valeur: '94,2', unite: '%', delta: 1.4, sens: 'up' as const },
  { titre: 'Lignes en retard', valeur: '18', unite: '', delta: -4, sens: 'down' as const },
  { titre: 'Charge semaine', valeur: '412', unite: 'h', delta: 6.2, sens: 'up' as const },
  { titre: 'Ruptures ouvertes', valeur: '3', unite: '', delta: 0, sens: 'flat' as const },
]

export function KpiSection() {
  return (
    <Section
      id="kpi"
      n="21"
      title="Indicateurs"
      intro={
        <>
          Un KPI se lit en un chiffre et une tendance. Le libellé est en tertiaire au-dessus, la
          valeur en 36 px tabulaire, la variation en dessous — jamais l’inverse : c’est le chiffre
          qu’on cherche, pas son nom.
        </>
      }
    >
      <Fiche
        nom="Carte KPI"
        from="pages/dashboard — composition"
        etat="cursor"
        note={
          <>
            Recette Cursor : <Tok>rounded-[12px]</Tok> · fond <Tok>#fcfcfc</Tok> · filet{' '}
            <Tok>--border-quaternary</Tok> en ombre · <Tok>p-4</Tok>. Aucune bordure, aucune ombre
            portée.
          </>
        }
      >
        <Grid min={200}>
          {KPIS.map((k) => (
            <Card key={k.titre} padding="sm" className="border-0">
              <CardContent className="p-0">
                <div className="text-[12px] leading-[16px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
                  {k.titre}
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-[36px] font-medium leading-none tracking-[-0.46px] tabular-nums text-[#141414]">
                    {k.valeur}
                  </span>
                  {k.unite ? (
                    <span className="text-[14px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
                      {k.unite}
                    </span>
                  ) : null}
                </div>
                <div
                  className={cn(
                    'mt-2 inline-flex items-center gap-1 text-[12px] tabular-nums',
                    k.sens === 'up' && 'text-[#007041]',
                    k.sens === 'down' && 'text-[#be1744]',
                    k.sens === 'flat' && 'text-[color-mix(in_oklab,#141414_60%,transparent)]'
                  )}
                >
                  {k.sens === 'up' ? (
                    <TrendingUp className="size-3" />
                  ) : k.sens === 'down' ? (
                    <TrendingDown className="size-3" />
                  ) : null}
                  {k.delta === 0
                    ? 'stable'
                    : `${k.delta > 0 ? '+' : ''}${k.delta.toString().replace('.', ',')} vs S-1`}
                </div>
              </CardContent>
            </Card>
          ))}
        </Grid>
        <div className="mt-3">
          <Rule kind="dont">
            Colorer la valeur elle-même. La couleur porte la <em>variation</em> ; un chiffre rouge
            en permanence cesse d’alerter.
          </Rule>
        </div>
      </Fiche>
    </Section>
  )
}

/* ── 22 Lien X3 ─────────────────────────────────────────────── */

export function LiensSection() {
  return (
    <Section
      id="liens"
      n="22"
      title="Liens externes"
      intro={
        <>
          Un numéro d’OF ou de commande peut ouvrir la fiche Sage X3 correspondante. Le composant ne
          rend jamais un lien mort : sans endpoint configuré, il retombe silencieusement en texte
          brut.
        </>
      }
    >
      <Fiche
        nom="X3Link"
        from="@r/components/x3-link"
        etat="airbnb"
        note={
          <>
            Deux formes. Si le numéro porte déjà une action interne (ouverture d’un panneau), X3
            passe en <Tok>iconOnly</Tok> à côté. Sinon le numéro <em>est</em> le lien. L’endpoint
            vient de la prop partagée <Tok>x3Web</Tok>, qui suit l’environnement de la session :
            sans endpoint configuré, les exemples ci-dessous rendent du texte brut — c’est le
            comportement attendu, jamais un lien mort.
          </>
        }
      >
        <Grid min={280}>
          <div className="min-w-0">
            <Caption className="mb-2">Numéro cliquable</Caption>
            <Panel padding="sm">
              <X3Link
                fonction="GESMFG"
                cle="F126-44429"
                title="Ouvrir l’OF dans Sage X3"
                className="font-mono text-[13px] text-[#141414]"
              >
                F126-44429
              </X3Link>
            </Panel>
          </div>
          <div className="min-w-0">
            <Caption className="mb-2">Icône séparée — iconOnly</Caption>
            <Panel padding="sm">
              <span className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  className="font-mono text-[13px] text-[#141414] underline-offset-2 hover:underline"
                >
                  AR24518·L2
                </button>
                <X3Link fonction="GESSOH" cle="AR24518" title="Ouvrir dans X3" iconOnly />
              </span>
            </Panel>
          </div>
        </Grid>

        <Sub title="Grammaire des liens" className="mt-6" />
        <Panel padding="none">
          <SpecTable
            head={['Destination', 'Signal', 'Comportement']}
            rows={[
              [
                'Interne (autre page du board)',
                <Badge variant="ghost">texte souligné</Badge>,
                'même onglet, navigation Inertia',
              ],
              [
                'Externe (Sage X3)',
                <span className="inline-flex items-center gap-1 text-[13px] text-[#141414]">
                  <ExternalLink className="size-3" /> icône
                </span>,
                'nouvel onglet, rel="noopener"',
              ],
              [
                'Indisponible',
                <span className="text-[13px]">aucun signal</span>,
                'texte brut — jamais un lien inerte',
              ],
            ]}
          />
        </Panel>
      </Fiche>
    </Section>
  )
}

/* ── 23 État de la migration ────────────────────────────────── */

const MIGRATION: { nom: string; etat: 'cursor' | 'partiel' | 'airbnb'; reste: string }[] = [
  { nom: 'Card', etat: 'cursor', reste: '—' },
  { nom: 'DataTable', etat: 'cursor', reste: '—' },
  { nom: 'Sidebar', etat: 'cursor', reste: 'items non actifs encore en rayon 8' },
  { nom: 'Button', etat: 'partiel', reste: 'hauteurs 48/40/32/56 → 28/24/20/32, paddings' },
  { nom: 'Select', etat: 'cursor', reste: '—' },
  { nom: 'Badge', etat: 'cursor', reste: '—' },
  { nom: 'Pill', etat: 'cursor', reste: '—' },
  { nom: 'Input', etat: 'airbnb', reste: '56 px → 28 px, rayon 8 → 6, anneau de focus accent' },
  { nom: 'Textarea', etat: 'airbnb', reste: 'idem Input' },
  { nom: 'TextField', etat: 'airbnb', reste: 'suit Input' },
  { nom: 'Field', etat: 'airbnb', reste: 'espacements et tailles de libellé' },
  { nom: 'InputGroup', etat: 'airbnb', reste: 'suit Input' },
  { nom: 'Combobox', etat: 'cursor', reste: '—' },
  { nom: 'Switch', etat: 'cursor', reste: '—' },
  { nom: 'SearchBar', etat: 'airbnb', reste: '64 px + ombre au repos — à repenser entièrement' },
  { nom: 'Dialog', etat: 'cursor', reste: '—' },
  { nom: 'AlertDialog', etat: 'cursor', reste: '—' },
  { nom: 'Sheet', etat: 'cursor', reste: '—' },
  { nom: 'Tooltip', etat: 'cursor', reste: '—' },
  { nom: 'Toolbar', etat: 'airbnb', reste: 'segments en rayon plein → 6 px' },
  { nom: 'Calendar', etat: 'airbnb', reste: 'densité des cellules' },
  { nom: 'Spinner', etat: 'airbnb', reste: 'ton brand → neutre' },
  { nom: 'Skeleton', etat: 'airbnb', reste: 'rayon et amplitude du shimmer' },
  { nom: 'LoadingState', etat: 'airbnb', reste: 'suit Spinner' },
  { nom: 'Bubble', etat: 'airbnb', reste: 'rayon et tons' },
  { nom: 'Separator', etat: 'cursor', reste: '—' },
  { nom: 'BoardCard', etat: 'airbnb', reste: 'bande Listing, liseré 3 px, ombre au survol' },
  { nom: 'X3Link', etat: 'airbnb', reste: 'hover brand → accent' },
]

export function MigrationSection() {
  const compte = {
    cursor: MIGRATION.filter((m) => m.etat === 'cursor').length,
    partiel: MIGRATION.filter((m) => m.etat === 'partiel').length,
    airbnb: MIGRATION.filter((m) => m.etat === 'airbnb').length,
  }
  const total = MIGRATION.length

  return (
    <Section
      id="migration"
      n="23"
      title="État de la migration"
      last
      intro={
        <>
          Le thème Cursor est appliqué composant par composant, sous le scope{' '}
          <Tok>.theme-cursor</Tok> dans <Tok>inertia-react/styles/app.css</Tok>. Ce tableau dit ce
          qui est fait et ce qui reste — il se lit comme une file de travail, du plus structurant au
          plus cosmétique.
        </>
      }
    >
      <Grid min={200} className="mb-6">
        {(
          [
            ['cursor', compte.cursor, 'Retargetés'],
            ['partiel', compte.partiel, 'Partiels'],
            ['airbnb', compte.airbnb, 'À migrer'],
          ] as const
        ).map(([k, n, label]) => (
          <Panel key={k} padding="sm">
            <div className="flex items-center justify-between">
              <Caption>{label}</Caption>
              <Etat v={k} />
            </div>
            <div className="mt-2 text-[28px] font-medium leading-none tracking-[-0.46px] tabular-nums text-[#141414]">
              {n}
              <span className="text-[14px] text-[color-mix(in_oklab,#141414_36%,transparent)]">
                {' '}
                / {total}
              </span>
            </div>
          </Panel>
        ))}
      </Grid>

      <Panel padding="none">
        <SpecTable
          head={['Composant', 'État', 'Ce qui reste']}
          rows={MIGRATION.map((m) => [
            <span className="text-[13px] font-medium text-[#141414]">{m.nom}</span>,
            <Etat v={m.etat} />,
            m.reste,
          ])}
        />
      </Panel>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Rule kind="do">
          Retarger par sélecteur <Tok>[data-slot=…]</Tok> dans <Tok>app.css</Tok> : le composant
          reste intact, le thème est réversible.
        </Rule>
        <Rule kind="dont">
          Réécrire les <Tok>cva()</Tok> des primitives pour les valeurs Cursor tant que les deux
          thèmes coexistent — le thème d’origine casserait sans prévenir.
        </Rule>
      </div>
    </Section>
  )
}
