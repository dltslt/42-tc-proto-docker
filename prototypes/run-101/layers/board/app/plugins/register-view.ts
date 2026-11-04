// Files in app/plugins run once at app start: per request on the server, once in the browser.
import BoardView from '../components/BoardView.vue'

export default defineNuxtPlugin(() => {
  registerView({ id: 'board', label: 'Board', icon: 'i-lucide-square-kanban', order: 10, component: BoardView })
})
