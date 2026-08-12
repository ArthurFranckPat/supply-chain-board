import {
  BarresClassement,
  CourbeProjection,
  HistogrammeCharge,
  Jauge,
  Legende,
  Sparkline,
  type PeriodeCharge,
  type PointProjection,
  type SegmentCharge,
} from '@r/components/ui/chart'
import { fmtDecimal, fmtEuroCompact, fmtHeures, fmtNombre } from '@r/lib/charts/theme'

import { Caption, Demo, Fiche, Grid, Panel, Rule, Section, SpecTable, Sub, Tok } from './kit'

/**
 * Graphiques — la règle et les six formes qui la servent.
 *
 * Les jeux de démonstration reprennent la forme des données réelles du site
 * AE1 : des heures par poste, des semaines ISO, des quantités d'articles.
 * Un graphique nourri de données inventées ment sur sa densité.
 */

/* ── Jeux de démonstration ───────────────────────────────────── */

const SEMAINES = ['2026-W32', '2026-W33', '2026-W34', '2026-W35', '2026-W36', '2026-W37']

const CHARGE: PeriodeCharge[] = [
  {
    cle: '2026-W32',
    label: 'S32',
    valeurs: { ferme: 318, planifie: 74, suggere: 0 },
    capacite: 420,
  },
  {
    cle: '2026-W33',
    label: 'S33',
    valeurs: { ferme: 286, planifie: 118, suggere: 22 },
    capacite: 420,
  },
  {
    cle: '2026-W34',
    label: 'S34',
    valeurs: { ferme: 204, planifie: 186, suggere: 61 },
    capacite: 420,
  },
  {
    cle: '2026-W35',
    label: 'S35',
    valeurs: { ferme: 121, planifie: 244, suggere: 96 },
    capacite: 420,
  },
  {
    cle: '2026-W36',
    label: 'S36',
    valeurs: { ferme: 48, planifie: 262, suggere: 148 },
    capacite: 420,
  },
  {
    cle: '2026-W37',
    label: 'S37',
    valeurs: { ferme: 12, planifie: 231, suggere: 177 },
    capacite: 420,
  },
]

const SEGMENTS: SegmentCharge[] = [
  { serie: 'ferme', label: 'Ferme' },
  { serie: 'planifie', label: 'Planifié' },
  { serie: 'suggere', label: 'Suggéré' },
]

const VALORISATION = SEMAINES.map((periode, i) => ({
  cle: periode,
  label: `S${periode.slice(-2)}`,
  valeur: [1_284_000, 1_310_000, 1_262_000, 1_341_000, 1_388_000, 1_352_000][i] ?? 0,
}))

const POSTES = [
  { cle: 'PP_139', label: 'PP_139 · Ligne assemblage ETH', valeur: 6.8 },
  { cle: 'PP_830', label: 'PP_830 · Bouches hygro BDH60', valeur: 3.7 },
  { cle: 'PP_412', label: 'PP_412 · Caissons T4', valeur: 2.1 },
  { cle: 'PP_207', label: 'PP_207 · Montage moteurs', valeur: 0.9 },
]

const RETARDS = [
  { cle: 'F126-44429', label: 'F126-44429', valeur: 12 },
  { cle: 'F126-44502', label: 'F126-44502', valeur: 7 },
  { cle: 'F126-44518', label: 'F126-44518', valeur: 4 },
  { cle: 'F126-44601', label: 'F126-44601 (infaisable)', valeur: 9999, horsEchelle: true },
]

const STOCK: PointProjection[] = [
  { cle: 'S30', label: 'S30', valeur: 1840 },
  { cle: 'S31', label: 'S31', valeur: 1610 },
  { cle: 'S32', label: 'S32', valeur: 1355 },
  { cle: 'S33', label: 'S33', valeur: 1180 },
  { cle: 'S34', label: 'S34', valeur: 940, projete: true },
  { cle: 'S35', label: 'S35', valeur: 610, projete: true },
  { cle: 'S36', label: 'S36', valeur: 285, projete: true },
  { cle: 'S37', label: 'S37', valeur: -40, projete: true },
]

/* ── Section ─────────────────────────────────────────────────── */

export function GraphiquesSection() {
  return (
    <Section
      id="graphiques"
      n="24"
      title="Graphiques"
      intro={
        <>
          Aucune visualisation ne se dessine plus à la main. Ni SVG écrit à la main, ni div en{' '}
          <Tok>width: %</Tok> : tout passe par <Tok>@tanstack/charts</Tok>, qui possède les
          échelles, les axes, la mesure du conteneur et le survol. La règle est un changement de
          rupture assumé — elle invalide six réécritures du même histogramme de charge et douze de
          la même jauge, chacune avec sa propre arithmétique.
        </>
      }
    >
      <Sub
        title="Six formes, et une septième qui doit se justifier"
        hint="Le choix se fait sur la question posée, pas sur l'esthétique."
      />
      <Panel padding="sm">
        <SpecTable
          head={['Forme', 'Question à laquelle elle répond', 'Ce qu’elle remplace']}
          rows={[
            [
              <Tok key="s">Sparkline</Tok>,
              'Où va cette série, en un coup d’œil ?',
              'Colonnes de tuile KPI',
            ],
            [
              <Tok key="j">Jauge</Tok>,
              'Où en est-on par rapport à une borne ?',
              'Saturation, avancement OF, remplissage camion',
            ],
            [
              <Tok key="c">BarresClassement</Tok>,
              'Qui pèse le plus ?',
              'Charge par poste, ruptures, retards, top catégories',
            ],
            [
              <Tok key="h">HistogrammeCharge</Tok>,
              'Comment la charge se répartit-elle dans le temps, face à un plafond ?',
              'Charge poste, prévision, fil du poste, widgets MCP',
            ],
            [
              <Tok key="p">CourbeProjection</Tok>,
              'Où va ce niveau, et quand casse-t-il ?',
              'Historique et projection de stock',
            ],
            [
              <Tok key="l">Legende</Tok>,
              'Que veut dire cette couleur ?',
              'Légendes dessinées dans le SVG',
            ],
          ]}
        />
      </Panel>

      <div className="mt-6 grid gap-2">
        <Rule kind="do">
          Déclarer le domaine. Une échelle inférée se cale sur le maximum observé : 6,8 h et 3,7 h
          finissent presque identiques. Toute forme de comparaison ci-dessous fixe{' '}
          <Tok>[0, max]</Tok> explicitement.
        </Rule>
        <Rule kind="dont">
          Coder une information par la seule couleur. Le passé et le futur se distinguent par le
          trait plein contre le pointillé — pas par une teinte, qui ne survit pas à l’impression.
        </Rule>
      </div>

      {/* ── Sparkline ─────────────────────────────────────────── */}

      <Fiche
        nom="Sparkline"
        from="@r/components/ui/chart"
        etat="cursor"
        note={
          <>
            Volontairement muette : ni axe, ni graduation, ni légende (<Tok>guides: false</Tok> +{' '}
            <Tok>margin: 0</Tok>). Une sparkline se lit par sa forme ; les valeurs extrêmes vivent
            dans le texte qui l’entoure.
          </>
        }
      >
        <Grid min={260}>
          <Demo label="Valorisation du stock — 6 semaines" spec="hauteur 56">
            <div className="w-full">
              <Sparkline
                points={VALORISATION}
                format={fmtEuroCompact}
                ariaLabel="Valorisation du stock sur six semaines"
              />
              <div className="mt-1 flex justify-between text-[10px] tabular-nums text-[color-mix(in_oklab,#141414_60%,transparent)]">
                <span>S32</span>
                <span>S37</span>
              </div>
            </div>
          </Demo>
          <Demo label="Sans accent sur la dernière valeur" spec="accentuerDernier={false}">
            <Sparkline
              points={VALORISATION}
              accentuerDernier={false}
              format={fmtEuroCompact}
              ariaLabel="Valorisation du stock, sans accentuation"
            />
          </Demo>
        </Grid>
      </Fiche>

      {/* ── Jauge ─────────────────────────────────────────────── */}

      <Fiche
        nom="Jauge"
        from="@r/components/ui/chart"
        etat="cursor"
        note={
          <>
            La forme la plus dupliquée du produit. Le palier se déduit du taux — vert sous 85 %,
            ambre jusqu’à 100 %, rouge au-delà — et <Tok>seuil</Tok> pose un repère de capacité. Le
            domaine <Tok>[0, max]</Tok> est réellement partagé : deux jauges côte à côte sont enfin
            comparables. Quand toutes les lignes portent le même statut — un classement de postes «
            en retard » —, passer <Tok>couleur</Tok> plutôt qu’un palier : une barre verte dans une
            liste d’alertes alerte à contresens.
          </>
        }
      >
        <Panel padding="sm">
          <div className="flex flex-col gap-3">
            {[
              { code: 'PP_139', charge: 312, capacite: 420 },
              { code: 'PP_830', charge: 396, capacite: 420 },
              { code: 'PP_412', charge: 448, capacite: 420 },
            ].map((p) => (
              <div key={p.code}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-[13px] text-[#141414]">{p.code}</span>
                  <span className="text-[12px] tabular-nums text-[color-mix(in_oklab,#141414_60%,transparent)]">
                    {fmtHeures(p.charge)} / {fmtHeures(p.capacite)}
                  </span>
                </div>
                <Jauge
                  valeur={p.charge}
                  max={Math.max(p.capacite, p.charge)}
                  seuil={p.capacite}
                  ariaLabel={`Saturation du poste ${p.code}`}
                />
              </div>
            ))}
          </div>
          <Caption className="mt-3">
            Le trait vertical est la capacité. La troisième jauge la dépasse : l’échelle s’étend
            jusqu’à la charge réelle plutôt que d’écrêter à 100 %.
          </Caption>
        </Panel>
      </Fiche>

      {/* ── Classement ────────────────────────────────────────── */}

      <Fiche
        nom="BarresClassement"
        from="@r/components/ui/chart"
        etat="cursor"
        note={
          <>
            Les valeurs hors échelle — un retard sentinelle à 9999 jours, une rupture infaisable —
            sont écrêtées au maximum réel et atténuées, plutôt que de tasser tout le classement
            contre zéro.
          </>
        }
      >
        <Grid min={300}>
          <Demo label="Charge en retard par poste" spec="format = heures">
            <BarresClassement
              lignes={POSTES}
              format={fmtHeures}
              ariaLabel="Charge en retard par poste de charge"
            />
          </Demo>
          <Demo label="Retards de promesse" spec="horsEchelle sur l’infaisable">
            <BarresClassement
              lignes={RETARDS}
              format={(v) => `${fmtNombre(v)} j`}
              ariaLabel="Ordres de fabrication en retard de promesse"
            />
          </Demo>
        </Grid>
      </Fiche>

      {/* ── Histogramme de charge ─────────────────────────────── */}

      <Fiche
        nom="HistogrammeCharge"
        from="@r/components/ui/chart"
        etat="cursor"
        note={
          <>
            L’empilement est déclaré par <Tok>segments</Tok>, jamais laissé à l’ordre des données :
            c’est lui qui rend deux périodes comparables. Le plafond de capacité est une courbe —
            plate quand la capacité est constante, épousant ses variations sinon. Le survol donne le
            total, le détail par série, la capacité et la saturation. En option : valeurs inscrites
            (<Tok>labelsEnBarre</Tok>), totaux au sommet (<Tok>totaux</Tok>), moyenne mobile (
            <Tok>moyenneMobile</Tok>), pic (<Tok>pic</Tok>) et domaine partagé (<Tok>max</Tok>) —
            c’est lui qui rend deux histogrammes côte à côte comparables.
          </>
        }
      >
        <Panel padding="sm">
          <HistogrammeCharge
            periodes={CHARGE}
            segments={SEGMENTS}
            format={fmtDecimal}
            labelsEnBarre
            totaux
            moyenneMobile={2}
            pic
            ariaLabel="Charge hebdomadaire du poste PP_139, empilée par statut"
            ariaDescription="Six semaines, de S32 à S37, face à une capacité de 420 heures. La part ferme décroît de 318 à 12 heures pendant que le suggéré monte de 0 à 177."
          />
          <Legende segments={SEGMENTS} className="mt-3" />
          <Caption className="mt-2">
            La bascule du ferme vers le suggéré au fil des semaines est la lecture attendue d’un
            planificateur : ce qui est loin n’est pas encore lancé. La pastille marque le pic, la
            courbe pointillée la moyenne mobile.
          </Caption>
        </Panel>
      </Fiche>

      {/* ── Courbe de projection ──────────────────────────────── */}

      <Fiche
        nom="CourbeProjection"
        from="@r/components/ui/chart"
        etat="cursor"
        note={
          <>
            Le passé est plein, le futur est pointillé — deux marques, pas deux teintes, pour rester
            lisible en noir et blanc. <Tok>seuil</Tok> trace le point de rupture,{' '}
            <Tok>charniere</Tok> la bascule vers le calculé. Avec <Tok>afficherFluxMiroir</Tok>, les
            entrées/ressources et sorties/besoins s'ajoutent en barres miroir sous la courbe — une
            échelle de flux par moitié (passé et projection brassent des ordres de grandeur sans
            rapport), les valeurs réelles vivant dans le tooltip.
          </>
        }
      >
        <Panel padding="sm">
          <CourbeProjection
            points={STOCK}
            seuil={0}
            charniere="S34"
            format={fmtNombre}
            ariaLabel="Stock projeté de l’article BDH60 sur huit semaines"
            ariaDescription="Le stock passe de 1840 pièces en S30 à une rupture projetée de 40 pièces manquantes en S37."
          />
          <Caption className="mt-2">
            La rupture se lit au croisement du zéro, en S37. C’est l’information que la page{' '}
            <Tok>/ruptures</Tok> doit pouvoir citer sans recalculer quoi que ce soit.
          </Caption>
        </Panel>
      </Fiche>

      {/* ── Ce que la librairie ne fait pas ───────────────────── */}

      <Sub
        title="Ce que la librairie ne fait pas pour nous"
        hint="Quatre points où l'oubli produit un défaut silencieux."
      />
      <Panel padding="sm">
        <SpecTable
          head={['Point', 'Comportement par défaut', 'Ce que le socle impose']}
          rows={[
            [
              'Format des dates',
              'ISO UTC dans les tooltips',
              <>
                <Tok>tooltip.format</Tok> surchargé partout — jj/mm/aaaa via{' '}
                <Tok>lib/charts/theme</Tok>
              </>,
            ],
            [
              'Largeur au montage',
              <>
                <Tok>initialWidth</Tok> vaut 640 px
              </>,
              'Une largeur initiale cohérente avec l’emplacement réel',
            ],
            [
              'Enfant de grille',
              'Ne peut pas rétrécir sans min-width',
              <>
                <Tok>min-width: 0</Tok> sur <Tok>[data-slot=&apos;chart&apos;]</Tok>
              </>,
            ],
            [
              'Légende',
              <>
                Rendue en SVG et <Tok>aria-hidden</Tok>
              </>,
              'Légende HTML à côté du graphique, sélectionnable et imprimable',
            ],
          ]}
        />
      </Panel>

      <div className="mt-4">
        <Rule kind="dont">
          Forcer un diagramme d’étapes dans un graphique. Le cycle de vie d’une commande et le
          chemin critique d’une promesse n’ont ni axe ni valeur continue : ce sont des steppers, ils
          restent en HTML — idem pour la frise des expéditions, un planning de créneaux camion
          (début/fin), pas une visualisation de valeurs.
        </Rule>
      </div>
    </Section>
  )
}
