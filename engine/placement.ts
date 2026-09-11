import { CELL_COUNT, COL_OF, NEIGHBORS, START_COL } from './grid'
import type { Cells, CheckedMask, ColorKey, PlacementValidation } from './types'

export const MIN_COUNT = 1
export const MAX_COUNT = 5

/**
 * Une case est une ancre si on a le droit d'y demarrer un groupe.
 *
 * Regle officielle (Schmidt Spiele, "Noch mal!", DABEI GELTEN FOLGENDE REGELN) :
 *   "Kreuze duerfen nur waagerecht oder senkrecht benachbart zu mindestens einem
 *    bereits angekreuzten Kaestchen ODER IN DER STARTSPALTE BEGINNEND gesetzt werden."
 *
 * La colonne de depart H est donc une ancre PERMANENTE, pas seulement au premier coup.
 *
 * La regle "le tout premier jet d'un joueur doit etre en colonne H" n'a pas besoin
 * d'etre traitee a part : masque vide => aucune case n'est adjacente a du deja-coche
 * => le predicat se reduit exactement a "etre en colonne H".
 */
export function isAnchor(idx: number, mask: CheckedMask): boolean {
    if (COL_OF[idx] === START_COL) return true
    const n = NEIGHBORS[idx]
    for (let i = 0; i < n.length; i++) if (mask[n[i]]) return true
    return false
}

/** Cases utilisables ce coup-ci : bonne couleur et pas deja cochees. */
function buildAvailable(cells: Cells, mask: CheckedMask, color: ColorKey): Uint8Array {
    const avail = new Uint8Array(CELL_COUNT)
    for (let i = 0; i < CELL_COUNT; i++) {
        if (mask[i]) continue
        if (cells[i][0] !== color) continue
        avail[i] = 1
    }
    return avail
}

/**
 * Restreint la recherche aux cases utiles : tout groupe valide est connexe et contient
 * une ancre, donc chacune de ses cases est a distance <= count-1 d'une ancre en passant
 * par des cases du groupe. BFS multi-source depuis les ancres, profondeur count-1.
 */
function buildSearchSpace(
    avail: Uint8Array,
    mask: CheckedMask,
    count: number,
): { inV: Uint8Array; vertices: number[]; anchors: Uint8Array; hasAnchor: boolean } {
    const anchors = new Uint8Array(CELL_COUNT)
    const inV = new Uint8Array(CELL_COUNT)
    let frontier: number[] = []
    let hasAnchor = false

    for (let i = 0; i < CELL_COUNT; i++) {
        if (!avail[i]) continue
        if (!isAnchor(i, mask)) continue
        anchors[i] = 1
        inV[i] = 1
        frontier.push(i)
        hasAnchor = true
    }

    for (let depth = 1; depth < count && frontier.length > 0; depth++) {
        const next: number[] = []
        for (const cur of frontier) {
            const n = NEIGHBORS[cur]
            for (let i = 0; i < n.length; i++) {
                const u = n[i]
                if (!avail[u] || inV[u]) continue
                inV[u] = 1
                next.push(u)
            }
        }
        frontier = next
    }

    const vertices: number[] = []
    for (let i = 0; i < CELL_COUNT; i++) if (inV[i]) vertices.push(i)
    return { inV, vertices, anchors, hasAnchor }
}

/**
 * Enumeration ESU (Wernicke) : chaque sous-ensemble connexe de taille k est produit
 * EXACTEMENT UNE FOIS, enracine sur son sommet d'indice minimum. Pas de generation
 * suivie de deduplication : le cout est proportionnel au nombre de resultats.
 *
 * `emit` recoit un tableau reutilise en interne. Copier avant de le conserver.
 */
function enumerateConnectedSubsets(
    inV: Uint8Array,
    vertices: number[],
    k: number,
    emit: (sub: readonly number[]) => void,
): void {
    // marked[u] = 1 si u appartient a Vsub ou au voisinage de Vsub.
    const marked = new Uint8Array(CELL_COUNT)
    const sub: number[] = []

    function extend(ext: number[], root: number): void {
        if (sub.length === k) { emit(sub); return }
        const remaining = ext.slice()
        while (remaining.length > 0) {
            const w = remaining.pop()!
            const added: number[] = []
            const nextExt = remaining.slice()
            const n = NEIGHBORS[w]
            for (let i = 0; i < n.length; i++) {
                const u = n[i]
                if (!inV[u] || marked[u]) continue
                // Marque meme si u <= root : u entre dans N(Vsub) et sort donc du
                // voisinage exclusif des sommets ajoutes ensuite.
                marked[u] = 1
                added.push(u)
                if (u > root) nextExt.push(u)
            }
            sub.push(w)
            extend(nextExt, root)
            sub.pop()
            for (const u of added) marked[u] = 0
        }
    }

    for (const v of vertices) {
        marked.fill(0)
        marked[v] = 1
        sub.length = 0
        sub.push(v)
        const ext: number[] = []
        const n = NEIGHBORS[v]
        for (let i = 0; i < n.length; i++) {
            const u = n[i]
            if (!inV[u]) continue
            marked[u] = 1
            if (u > v) ext.push(u)
        }
        extend(ext, v)
    }
}

/**
 * Tous les placements legaux pour une combo (couleur, nombre).
 *
 * La contrainte "toutes les croix dans un seul bloc de couleur" est automatique :
 * la connexite dans le graphe des cases non cochees de la couleur implique une chaine
 * d'adjacences de meme couleur, donc un bloc unique.
 */
export function legalPlacements(
    cells: Cells,
    mask: CheckedMask,
    color: ColorKey,
    count: number,
): number[][] {
    assertCount(count)
    const avail = buildAvailable(cells, mask, color)
    const { inV, vertices, anchors, hasAnchor } = buildSearchSpace(avail, mask, count)
    if (!hasAnchor) return []

    const results: number[][] = []
    enumerateConnectedSubsets(inV, vertices, count, sub => {
        for (let i = 0; i < sub.length; i++) {
            if (anchors[sub[i]]) { results.push(sub.slice()); return }
        }
    })
    return results
}

/** Existe-t-il au moins un placement legal ? Coupe des le premier trouve. */
export function hasLegalPlacement(
    cells: Cells,
    mask: CheckedMask,
    color: ColorKey,
    count: number,
): boolean {
    assertCount(count)
    const avail = buildAvailable(cells, mask, color)
    const { inV, vertices, anchors, hasAnchor } = buildSearchSpace(avail, mask, count)
    if (!hasAnchor) return false

    let found = false
    enumerateConnectedSubsets(inV, vertices, count, sub => {
        if (found) return
        for (let i = 0; i < sub.length; i++) {
            if (anchors[sub[i]]) { found = true; return }
        }
    })
    return found
}

/**
 * Cases encore cliquables compte tenu des cases deja selectionnees ce tour.
 * Ne garde que les placements compatibles avec TOUTES les cases en attente.
 */
export function selectableCells(
    allPlacements: readonly (readonly number[])[],
    pending: readonly number[],
): Set<number> {
    const selectable = new Set<number>()
    for (const placement of allPlacements) {
        let compatible = true
        for (const p of pending) {
            if (!placement.includes(p)) { compatible = false; break }
        }
        if (!compatible) continue
        for (const idx of placement) {
            if (!pending.includes(idx)) selectable.add(idx)
        }
    }
    return selectable
}

/** Les cases d'un groupe se touchent-elles toutes entre elles, orthogonalement ? */
export function areCellsContiguous(indices: readonly number[]): boolean {
    if (indices.length <= 1) return true
    const inSet = new Uint8Array(CELL_COUNT)
    for (const idx of indices) inSet[idx] = 1
    const visited = new Uint8Array(CELL_COUNT)
    const queue = [indices[0]]
    visited[indices[0]] = 1
    let seen = 1
    while (queue.length > 0) {
        const cur = queue.pop()!
        const n = NEIGHBORS[cur]
        for (let i = 0; i < n.length; i++) {
            const u = n[i]
            if (!inSet[u] || visited[u]) continue
            visited[u] = 1
            seen++
            queue.push(u)
        }
    }
    return seen === indices.length
}

/**
 * Validation finale, independante de l'enumerateur : chaque predicat de la regle
 * est teste separement. Sert de filet de securite et de reference pour les tests.
 */
export function validatePlacement(
    selected: readonly number[],
    cells: Cells,
    mask: CheckedMask,
    color: ColorKey,
    count: number,
): PlacementValidation {
    if (count < MIN_COUNT || count > MAX_COUNT) {
        return { valid: false, reason: `Le nombre de cases doit etre entre ${MIN_COUNT} et ${MAX_COUNT}` }
    }
    if (selected.length !== count) {
        return { valid: false, reason: `Tu dois cocher exactement ${count} case(s)` }
    }
    if (new Set(selected).size !== selected.length) {
        return { valid: false, reason: 'Une case est selectionnee deux fois' }
    }
    for (const idx of selected) {
        if (!Number.isInteger(idx) || idx < 0 || idx >= CELL_COUNT) {
            return { valid: false, reason: 'Case hors grille' }
        }
        if (cells[idx][0] !== color) {
            return { valid: false, reason: 'Toutes les cases doivent etre de la couleur choisie' }
        }
        if (mask[idx]) return { valid: false, reason: 'Cette case est deja cochee' }
    }
    if (!areCellsContiguous(selected)) {
        return { valid: false, reason: 'Les cases doivent etre contigues (horizontalement ou verticalement)' }
    }
    for (const idx of selected) {
        if (isAnchor(idx, mask)) return { valid: true }
    }
    return {
        valid: false,
        reason: 'Le groupe doit toucher une case deja cochee ou commencer dans la colonne H',
    }
}

function assertCount(count: number): void {
    if (!Number.isInteger(count) || count < MIN_COUNT || count > MAX_COUNT) {
        throw new RangeError(`count doit etre un entier entre ${MIN_COUNT} et ${MAX_COUNT}, recu ${count}`)
    }
}
