#!/usr/bin/env node
// Save the running server's OpenAPI document as contract/v1.openapi.json: the frozen v1 contract.
// Run it again only for a deliberate change of the snapshot, for example to record a new endpoint.
//   node scripts/freeze-openapi.mjs [http://localhost:3102]
import { writeFileSync } from 'node:fs'

const base = process.argv[2] ?? 'http://localhost:3102'
const doc = await (await fetch(`${base}/api/v1/openapi.json`)).json()
writeFileSync(new URL('../contract/v1.openapi.json', import.meta.url), JSON.stringify(doc, null, 2) + '\n')
console.log(`Frozen ${Object.keys(doc.paths).length} paths`)
