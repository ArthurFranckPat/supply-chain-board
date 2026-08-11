---
name: Supply Chain Board
description: Identité Cursor PRODUIT light (extrait CSS live)
colors:
  sidebar: '#f3f3f3'
  chrome: '#f8f8f8'
  editor: '#fcfcfc'
  base: '#141414'
  brand: '#f54e00'
  accent: '#2778c1'
  success: '#007041'
  warn: '#a46700'
  danger: '#be1744'
  orange: '#cd4500'
typography:
  ui:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 13px
    fontWeight: 418
  mono:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
    fontSize: 12px
rounded:
  sm: 4px
  base: 6px
  lg: 8px
  xl: 12px
  full: 9999px
---

# Design System: Supply Chain Board (Cursor produit light)

Source de vérité : variables CSS résolues extraites du produit Cursor (2026-08-11),
pas le marketing getdesign (`cursor/DESIGN.md` conservé à titre de référence site).

## Surfaces

| Rôle      | Token       | Hex       | Usage board            |
| --------- | ----------- | --------- | ---------------------- |
| Sidebar   | `--sidebar` | `#f3f3f3` | AppSidebar             |
| Chrome    | `--chrome`  | `#f8f8f8` | Fond page / TopBar     |
| Editor    | `--editor`  | `#fcfcfc` | Cards KPI              |
| Base      | `--base`    | `#141414` | Texte + CTA filled     |
| Brand     | `--brand`   | `#f54e00` | Accent rare / wordmark |
| Accent UI | `--accent`  | `#2778c1` | Focus / liens          |

## Notes

- `#F9F8F8` ≈ chrome `#f8f8f8` ; `#F2F3F3` ≈ sidebar `#f3f3f3`.
- CTA filled = `--base` (noir), pas orange. Orange = marque.
- Radius produit : base 6px, lg 8px.
- Typo UI système 13px / weight ~418–500.
