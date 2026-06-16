import '../../resources/css/app.css'

import { render } from 'solid-js/web'
import { resolvePageComponent } from '@adonisjs/inertia/helpers'
import { createInertiaApp } from '../lib/inertia-solid'

const pages = import.meta.glob('../pages/**/*.tsx')

createInertiaApp({
  resolve: (name) => resolvePageComponent(`../pages/${name}.tsx`, pages),
  setup({ el, App, props }) {
    render(() => <App {...props} />, el)
  },
})
