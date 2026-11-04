import { describe, expect, it } from 'vitest'
import { getView, listViews, registerView } from '../layers/core/app/utils/views'

const view = (id: string, order: number) => ({ id, label: id, icon: '', order, component: {} })

describe('view registry', () => {
  it('lists views by order, not by registration order', () => {
    registerView(view('second', 20))
    registerView(view('first', 10))
    expect(listViews().map(v => v.id)).toEqual(['first', 'second'])
  })

  it('finds a view by id and returns undefined for an unknown id', () => {
    expect(getView('first')?.id).toBe('first')
    expect(getView('missing')).toBeUndefined()
  })

  it('treats registering the same id again as a replacement', () => {
    const before = listViews().length
    registerView(view('first', 10))
    expect(listViews()).toHaveLength(before)
  })
})
