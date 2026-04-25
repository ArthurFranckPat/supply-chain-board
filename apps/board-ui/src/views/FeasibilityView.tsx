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
    <div className="max-w-5xl space-y-3">
      <div className="flex gap-0 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => resetTab(tab.key)}
            className={`h-[28px] px-3 text-[11px] font-semibold border border-transparent border-b-0 -mb-px transition-colors ${
              activeTab === tab.key ? 'bg-card text-foreground border-border relative after:absolute after:inset-x-0 after:top-0 after:h-[2px] after:bg-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'check' && (
        <CheckTab
          loading={loading} depthMode={depthMode} useReceptions={useReceptions}
          onDepthModeChange={setDepthMode} onUseReceptionsChange={setUseReceptions}
          onCheck={(params) => check.mutate(params)}
        />
      )}
      {activeTab === 'promise' && (
        <PromiseTab loading={loading} onPromise={(params) => findPromise.mutate(params)} />
      )}
      {activeTab === 'reschedule' && (
        <RescheduleTab
          loading={loading} depthMode={depthMode} useReceptions={useReceptions}
          onDepthModeChange={setDepthMode} onUseReceptionsChange={setUseReceptions}
          onReschedule={(params) => reschedule.mutate(params)} onResetMutations={resetMutations}
        />
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-3 py-2 text-xs">
          {error.message}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-3 h-3 border-2 border-primary border-t-transparent animate-spin" />
          Analyse en cours...
        </div>
      )}

      {result && <FeasibilityResultDisplay result={result} />}
    </div>
  )
}
