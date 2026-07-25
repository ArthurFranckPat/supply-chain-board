/**
 * Point d'entrée de l'app MCP « charge » (issue #89).
 *
 * Bundle autonome : tout le JS/CSS est inliné à la construction
 * (`npm run mcp:apps`) car la resource `ui://supply-board/charge` est servie par
 * le protocole, sans serveur de fichiers derrière — et la CSP déclarée n'autorise
 * aucun domaine.
 */

import { createRoot } from 'react-dom/client'
import { ChargeApp } from './charge-app'

const root = document.getElementById('root')
if (!root) throw new Error('#root absent du template de l’app charge')

createRoot(root).render(<ChargeApp />)
