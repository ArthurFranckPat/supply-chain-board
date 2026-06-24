import { test } from '@japa/runner'
import { parseTechnicalInfos, parseResponse } from '#app/x3/response-parser'

// Enveloppe SOAP réaliste : bloc <technicalInfos> tel que renvoyé par Syracuse
// (CAdxWebServiceXmlCC), durées en ms. Issue #39, WI-1.
const TECH_BLOCK = `
  <technicalInfos xsi:type="wss:CAdxTechnicalInfos">
    <busy xsi:type="xsd:boolean">false</busy>
    <loadWebsDuration xsi:type="xsd:int">1234</loadWebsDuration>
    <poolDistribDuration xsi:type="xsd:int">5</poolDistribDuration>
    <poolExecDuration xsi:type="xsd:int">87</poolExecDuration>
    <poolWaitDuration xsi:type="xsd:int">42</poolWaitDuration>
    <poolRequestDuration xsi:type="xsd:int">130</poolRequestDuration>
    <poolEntryIdx xsi:type="xsd:int">3</poolEntryIdx>
    <totalDuration xsi:type="xsd:int">1368</totalDuration>
  </technicalInfos>`

test.group('parseTechnicalInfos (issue #39 WI-1)', () => {
  test('extrait les durées et l’index de client', ({ assert }) => {
    const t = parseTechnicalInfos(TECH_BLOCK)
    assert.exists(t)
    assert.equal(t!.loadWebs, 1234)
    assert.equal(t!.poolDistrib, 5)
    assert.equal(t!.poolExec, 87)
    assert.equal(t!.poolWait, 42)
    assert.equal(t!.poolRequest, 130)
    assert.equal(t!.poolEntryIdx, 3)
    assert.equal(t!.total, 1368)
  })

  test('renvoie undefined si aucun bloc technicalInfos', ({ assert }) => {
    assert.isUndefined(parseTechnicalInfos('<soap><body>rien</body></soap>'))
  })

  test('champ absent → null (pas de crash)', ({ assert }) => {
    const t = parseTechnicalInfos('<technicalInfos><totalDuration>10</totalDuration></technicalInfos>')
    assert.exists(t)
    assert.equal(t!.total, 10)
    assert.isNull(t!.loadWebs)
    assert.isNull(t!.poolEntryIdx)
  })

  test('parseResponse attache tech même sur resultXml nil (cold init visible)', ({ assert }) => {
    const raw = `<status>1</status><resultXml xsi:nil="true"/>${TECH_BLOCK}`
    const resp = parseResponse(raw, 'GRP2', 'GRP3')
    assert.equal(resp.error, 'resultXml is nil')
    assert.exists(resp.tech)
    assert.equal(resp.tech!.loadWebs, 1234)
  })
})
