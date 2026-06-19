import type { Component } from 'solid-js'
import { usePage } from '../lib/inertia-solid'
import UserMenu from '@/components/user-menu'

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
      <div style={{ display: 'flex', 'justify-content': 'flex-end' }}>
        <UserMenu tone="primary" />
      </div>
      <h1>SolidJS + Inertia ✅</h1>
      <p>{props.message}</p>
      <p style={{ color: '#64748b' }}>URL courante : {page.url}</p>
    </main>
  )
}

export default Home
