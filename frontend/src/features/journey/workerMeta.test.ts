import { describe, expect, it } from 'vitest'
import { fallbackWorkerMeta, getWorkerMeta, workerMeta } from './workerMeta'

describe('worker metadata single source', () => {
  it('covers the five planning workers with label, color, marker color and icon', () => {
    for (const worker of ['flight', 'hotel', 'attraction', 'itinerary', 'budget']) {
      const meta = workerMeta[worker]
      expect(meta, worker).toBeDefined()
      expect(meta.label.endsWith('智能体'), worker).toBe(true)
      expect(meta.shortLabel, worker).not.toContain('智能体')
      expect(meta.color, worker).toMatch(/^#[0-9a-f]{6}$/i)
      expect(meta.markerColor, worker).toMatch(/^#[0-9a-f]{6}$/i)
      expect(meta.icon, worker).toBeDefined()
    }
  })

  it('keeps marker colors aligned with worker colors for map rendering', () => {
    for (const worker of Object.keys(workerMeta)) {
      expect(workerMeta[worker].markerColor, worker).toBe(workerMeta[worker].color)
    }
  })

  it('falls back to the planning agent for unknown workers', () => {
    expect(getWorkerMeta('unknown').label).toBe(fallbackWorkerMeta.label)
    expect(getWorkerMeta('').label).toBe(fallbackWorkerMeta.label)
  })

  it('exposes each worker via getWorkerMeta', () => {
    expect(getWorkerMeta('flight').shortLabel).toBe('航班')
    expect(getWorkerMeta('budget').shortLabel).toBe('预算')
  })
})
