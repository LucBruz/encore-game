import { GRID_01 } from './grid-01'
import { GRID_02 } from './grid-02'
import { GRID_03 } from './grid-03'
import { GRID_04 } from './grid-04'
import { GRID_05 } from './grid-05'
import { GRID_06 } from './grid-06'
import { GRID_07 } from './grid-07'
import { GRID_08 } from './grid-08'

export type GridId = '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08'

export type Grid = typeof GRID_01

export const GRID_MAP: Record<GridId, Grid> = {
    '01': GRID_01,
    '02': GRID_02,
    '03': GRID_03,
    '04': GRID_04,
    '05': GRID_05,
    '06': GRID_06,
    '07': GRID_07,
    '08': GRID_08,
}

export const ALL_GRIDS: Grid[] = Object.values(GRID_MAP)

export { GRID_01, GRID_02, GRID_03, GRID_04, GRID_05, GRID_06, GRID_07, GRID_08 }
