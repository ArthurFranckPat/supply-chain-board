import { createSignal } from 'solid-js'

/**
 * P1 validation island — proves the Solid build + Unpoly mount + fine-grained
 * reactivity all work end-to-end. Remove once a real island lands.
 */
export default function Ping(props: { label: string }) {
  const [count, setCount] = createSignal(0)

  return (
    <button
      type="button"
      onClick={() => setCount((n) => n + 1)}
      class="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
      title="Îlot Solid de validation (P1)"
    >
      <span>{props.label}</span>
      <span class="rounded bg-white/20 px-1 tabular-nums">{count()}</span>
    </button>
  )
}
