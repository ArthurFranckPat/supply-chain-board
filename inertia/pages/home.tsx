import type { Component } from 'solid-js'
import { usePage } from '../lib/inertia-solid'

interface HomeProps {
  message: string
}

/**
 * Page de fumée — valide la chaîne Inertia + adaptateur Solid de bout en bout.
 * À remplacer par les vraies pages métier lors de la migration.
 */
const Home: Component<HomeProps> = (props) => {
  const page = usePage()

  return (
    <main style={{ padding: '2rem', 'font-family': 'system-ui, sans-serif' }}>
      <h1>SolidJS + Inertia ✅</h1>
      <p>{props.message}</p>
      <p style={{ color: '#64748b' }}>URL courante : {page.url}</p>
    </main>
  )
}

export default Home
