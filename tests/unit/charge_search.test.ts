/**
 * Rang de la recherche /charge : un match sur le code poste passe avant un
 * `includes` coincé dans un article (EFL1830AE ne doit pas précéder PP_830).
 */
import { test } from '@japa/runner'
import { filterChargeLines, type ChargeSearchable } from '../../inertia-react/lib/charge/search.ts'

const line = (code: string, name: string, articles: string[], atelier = 'S9P'): ChargeSearchable => ({
  code,
  name,
  articles,
  atelier,
})

const EXAMPLE = [
  line('PP_091', 'LIGNE EMBALLAGE EAR', ['EFL1830AE EAR --2132 39DB -- BLF AL']),
  line('PP_127', 'LIGNE EMBALLAGE EHM', ['EMM830HU EMM  0*35 LR1-O- -- CHE AE']),
  line('PP_137', 'PREREGLAGE MOD HYGRO ETH', ['MH6830 MH ---- PRER01 4,2 ETH']),
  line('PP_830', 'LIGNE EASY HOME', ['11033025 ESHGPE CPT HYGHP- BAH']),
]

test.group('filterChargeLines — recherche /charge', () => {
  test('« 830 » : PP_830 d’abord (code), puis les articles par code poste', ({ assert }) => {
    assert.deepEqual(
      filterChargeLines(EXAMPLE, '830').map((l) => l.code),
      ['PP_830', 'PP_091', 'PP_127', 'PP_137']
    )
  })

  test('sans requête : ordre d’entrée conservé', ({ assert }) => {
    assert.deepEqual(
      filterChargeLines(EXAMPLE, '').map((l) => l.code),
      ['PP_091', 'PP_127', 'PP_137', 'PP_830']
    )
  })

  test('code exact avant code qui contient', ({ assert }) => {
    const lines = [line('PP_830S', 'LIGNE EASY HOME S', []), line('PP_830', 'LIGNE EASY HOME', [])]
    assert.deepEqual(
      filterChargeLines(lines, 'PP_830').map((l) => l.code),
      ['PP_830', 'PP_830S']
    )
  })

  test('libellé avant article', ({ assert }) => {
    const lines = [
      line('PP_091', 'LIGNE EMBALLAGE EAR', ['KIT EASY HOME']),
      line('PP_830', 'LIGNE EASY HOME', []),
    ]
    assert.deepEqual(
      filterChargeLines(lines, 'easy').map((l) => l.code),
      ['PP_830', 'PP_091']
    )
  })

  test('filtre atelier toujours appliqué', ({ assert }) => {
    const lines = [
      line('PP_091', 'EAR', ['EFL1830AE'], 'S8P'),
      line('PP_830', 'EASY HOME', [], 'S9P'),
    ]
    assert.deepEqual(
      filterChargeLines(lines, '830', new Set(['S9P'])).map((l) => l.code),
      ['PP_830']
    )
  })
})
