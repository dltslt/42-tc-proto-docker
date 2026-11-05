// Cross-layer test: the server lists exactly the layers that exist as folders, and none lacks a dependency.
import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { api } from '#layers/core/tests/http'

describe('GET /api/v1 module list', () => {
  it('matches the folders in layers/ and has no missing dependency', async () => {
    const folders = readdirSync(new URL('../layers', import.meta.url)).sort()
    const { body } = await api('')
    expect(body.modules.map((m: { name: string }) => m.name).sort()).toEqual(folders)
    for (const mod of body.modules) expect(mod.missing_dependencies).toEqual([])
  })

  it('orders layers from the bottom of the stack up', async () => {
    const { body } = await api('')
    expect(body.modules.map((m: { name: string }) => m.name)).toEqual(['core', 'workspace', 'events', 'items', 'tags'])
  })
})
