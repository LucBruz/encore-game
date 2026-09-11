import { CELL_COUNT } from './grid'
import type { CheckedMask } from './types'

export function createMask(): CheckedMask {
    return new Uint8Array(CELL_COUNT)
}

export function cloneMask(mask: CheckedMask): CheckedMask {
    return new Uint8Array(mask)
}

export function maskFromSet(set: ReadonlySet<number>): CheckedMask {
    const mask = createMask()
    set.forEach(idx => { mask[idx] = 1 })
    return mask
}

export function setFromMask(mask: CheckedMask): Set<number> {
    const set = new Set<number>()
    for (let i = 0; i < CELL_COUNT; i++) if (mask[i]) set.add(i)
    return set
}

export function maskFromIndices(indices: Iterable<number>): CheckedMask {
    const mask = createMask()
    for (const idx of indices) mask[idx] = 1
    return mask
}

export function countMask(mask: CheckedMask): number {
    let n = 0
    for (let i = 0; i < CELL_COUNT; i++) n += mask[i]
    return n
}
