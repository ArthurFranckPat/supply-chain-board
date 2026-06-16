import router from '@adonisjs/core/services/router'
import server from '@adonisjs/core/services/server'

const middleware = router.use([
  () => import('#middleware/unpoly_middleware'),
  () => import('#middleware/inertia_middleware'),
])
export { middleware }

server.use([
  () => import('@adonisjs/core/bodyparser_middleware'),
  () => import('@adonisjs/vite/vite_middleware')
])
