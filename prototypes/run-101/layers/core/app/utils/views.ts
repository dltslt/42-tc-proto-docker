// View registry: views add themselves here, so the shell and other views never import a view directly.
// Files in app/utils are auto-imported everywhere in the app (this one also runs in the server render).
import type { Component } from 'vue'

export interface ViewDefinition {
  id: string // also the URL: /<id>
  label: string
  icon: string
  order: number // lower comes first in the navigation
  component: Component
}

// Module-level state, like a static in C. On the server it is shared by all requests, which is safe only
// because it holds fixed definitions and never per-user data. A Map makes re-registering on each request harmless.
const views = new Map<string, ViewDefinition>()

export function registerView(view: ViewDefinition): void {
  views.set(view.id, view)
}

export function getView(id: string): ViewDefinition | undefined {
  return views.get(id)
}

export function listViews(): ViewDefinition[] {
  return [...views.values()].sort((a, b) => a.order - b.order)
}
