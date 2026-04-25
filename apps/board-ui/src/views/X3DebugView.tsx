import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

interface QueryResult {
  ok: boolean
  status: number
  data?: unknown
  error?: string
}

export function X3DebugView() {
  const [classe, setClasse] = useState('STOJOU')
  const [representation, setRepresentation] = useState('ZSTOJOU')
  const [where, setWhere] = useState('')
  const [orderBy, setOrderBy] = useState('')
  const [count, setCount] = useState('20')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [config, setConfig] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch(`${API_BASE}/x3/config`)
      .then(r => r.json())
      .then(d => setConfig(d))
      .catch(() => {})
  }, [])

  async function handleQuery() {
    setLoading(true)
    setResult(null)
    try {
      const params = new URLSearchParams({
        classe,
        representation,
        ...(where ? { where } : {}),
        ...(orderBy ? { order_by: orderBy } : {}),
        ...(count ? { count } : {}),
      })
      const res = await fetch(`${API_BASE}/x3/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classe,
          representation,
          where: where || null,
          order_by: orderBy || null,
          count: count ? parseInt(count) : null,
        }),
      })
      const data = await res.json().catch(() => null)
      setResult({ ok: res.ok, status: res.status, data })
    } catch (e) {
      setResult({ ok: false, status: 0, error: String(e) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuration X3 (lue depuis .env)</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-muted p-3 rounded-md overflow-auto font-mono whitespace-pre-wrap">
            {JSON.stringify(config, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Debug X3 - Requête Directe</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Classe</label>
              <Input value={classe} onChange={e => setClasse(e.target.value)} placeholder="STOJOU" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Representation</label>
              <Input value={representation} onChange={e => setRepresentation(e.target.value)} placeholder="ZSTOJOU" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Where</label>
              <Input value={where} onChange={e => setWhere(e.target.value)} placeholder="ITMREF eq 'MH7652'" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Order By</label>
              <Input value={orderBy} onChange={e => setOrderBy(e.target.value)} placeholder="DAT desc" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Count</label>
              <Input value={count} onChange={e => setCount(e.target.value)} placeholder="20" />
            </div>
          </div>
          <Button onClick={handleQuery} disabled={loading}>
            {loading ? 'Chargement...' : 'Exécuter'}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Résultat
              <span className={`text-xs px-2 py-0.5 rounded ${result.ok ? 'bg-green/10 text-green' : 'bg-red/10 text-red'}`}>
                HTTP {result.status}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-[500px] font-mono whitespace-pre-wrap">
              {JSON.stringify(result.data ?? result.error, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}