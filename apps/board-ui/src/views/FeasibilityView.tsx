import { useState } from 'react'
import { useFeasibility } from '@/hooks/useFeasibility'
import { CheckTab } from '@/components/feasibility/CheckTab'
import { PromiseTab } from '@/components/feasibility/PromiseTab'
import { RescheduleTab } from '@/components/feasibility/RescheduleTab'
import { FeasibilityResultDisplay } from '@/components/feasibility/FeasibilityResult'

type TabKey = 'check' | 'promise' | 'reschedule'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'check', label: 'Vérification' },
  { key: 'promise', label: 'Date promise' },
  { key: 'reschedule', label: 'Replanification' },
]

export function FeasibilityView() {
  const { check, findPromise, reschedule } = useFeasibility()
  const loading = check.isPending || findPromise.isPending || reschedule.isPending
  const error = check.error ?? findPromise.error ?? reschedule.error
  const result = check.data ?? findPromise.data ?? reschedule.data

  const [activeTab, setActiveTab] = useState<TabKey>('check')

  // Shared options
  const [depthMode, setDepthMode] = useState<'full' | 'level1'>('full')
  const [useReceptions, setUseReceptions] = useState(true)

  const resetMutations = () => {
    check.reset()
    findPromise.reset()
    reschedule.reset()
  }

  const resetTab = (tab: TabKey) => {
    setActiveTab(tab)
    resetMutations()
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => resetTab(tab.key)}
            className={`px-4 py-2 rounded-md text-xs font-semibold transition-colors ${
              activeTab === tab.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active tab */}
      {activeTab === 'check' && (
        <CheckTab
          loading={loading}
          depthMode={depthMode}
          useReceptions={useReceptions}
          onDepthModeChange={setDepthMode}
          onUseReceptionsChange={setUseReceptions}
          onCheck={(params) => check.mutate(params)}
        />
      )}

      {activeTab === 'promise' && (
        <PromiseTab
          loading={loading}
          onPromise={(params) => findPromise.mutate(params)}
        />
      )}

      {activeTab === 'reschedule' && (
        <RescheduleTab
          loading={loading}
          depthMode={depthMode}
          useReceptions={useReceptions}
          onDepthModeChange={setDepthMode}
          onUseReceptionsChange={setUseReceptions}
          onReschedule={(params) => reschedule.mutate(params)}
          onResetMutations={resetMutations}
        />
      )}

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
          {error.message}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Analyse en cours...
        </div>
      )}

      {/* Results */}
      {result && <FeasibilityResultDisplay result={result} />}
    </div>
  )
}
