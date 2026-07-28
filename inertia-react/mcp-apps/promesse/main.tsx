/**
 * Point d'entrée de l'app MCP « promesse » (issue #89, lot 4).
 *
 * Bundle autonome : tout le JS/CSS est inliné à la construction
 * (`npm run mcp:apps`) car la resource `ui://supply-board/promesse` est servie
 * par le protocole, sans serveur de fichiers derrière — et la CSP déclarée
 * n'autorise aucun domaine.
 */

import { createRoot } from 'react-dom/client'
import { PromesseApp } from './promesse-app'

const root = document.getElementById('root')
if (!root) throw new Error('#root absent du template de l’app promesse')

createRoot(root).render(<PromesseApp />)
