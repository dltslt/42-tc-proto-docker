// Files in app/plugins run once at app start: per request on the server, once in the browser.
import TreeView from '../components/TreeView.vue'

export default defineNuxtPlugin(() => {
  registerView({ id: 'tree', label: 'Tree', icon: 'i-lucide-list-tree', order: 20, component: TreeView })
})
