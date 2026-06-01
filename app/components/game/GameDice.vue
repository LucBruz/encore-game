<template>
  <div
    class="die-scene"
    :class="{ selected, selectable }"
    @click="selectable && $emit('select')"
  >
    <div ref="cubeRef" class="die-cube">
      <div
        v-for="face in faceDefinitions"
        :key="face.cls"
        class="die-face"
        :class="`die-face--${face.cls}`"
      >
        <!-- Face joker (couleur ou chiffre) -->
        <div v-if="face.isJoker" class="face-joker-content">
          <span class="joker-star">★</span>
        </div>
        <!-- Dé couleur : pastille colorée -->
        <div v-else-if="isColorDie" class="face-color-content">
          <div
            class="color-dot"
            :style="{
              background: face.colorHex,
              boxShadow: `0 0 12px 4px ${face.colorHex}66, 0 0 24px 8px ${face.colorHex}22`,
            }"
          />
        </div>
        <!-- Dé chiffre : grille de pips -->
        <div v-else class="face-number-content">
          <div
            v-for="n in 9"
            :key="n"
            class="pip"
            :class="face.pips.includes(n - 1) ? 'pip--on' : 'pip--off'"
          />
        </div>
      </div>
    </div>
    <div class="die-shadow" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import gsap from 'gsap'
import type { ColorKey } from '~/data/grids/grid-01'
import type { ColorFace, NumberFace } from '~/stores/gameStore'

// ─── Constantes ────────────────────────────────────────────────────────────────

const COLOR_LIST: (ColorKey | 'x')[] = ['g', 'y', 'b', 'p', 'o', 'x']

const COLOR_HEX: Record<string, string> = {
  g: '#5cc96e',
  y: '#f5d742',
  b: '#5b9ff5',
  p: '#e85a82',
  o: '#f58a35',
  x: '#888888',
}

const PIP_POSITIONS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

// Rotation du cube pour amener chaque face (1-6) face à la caméra
const FACE_ROTATION: Record<number, { x: number; y: number }> = {
  1: { x: 0,    y: 0   },   // front  : translateZ → pointe +Z
  2: { x: 90,   y: 0   },   // bottom : rotateX(-90) → pointe +Y → cube rotateX(+90) pour la ramener vers caméra
  3: { x: 0,    y: 90  },   // left   : rotateY(-90) → pointe -X → cube rotateY(+90)
  4: { x: 0,    y: -90 },   // right  : rotateY(+90) → pointe +X → cube rotateY(-90)
  5: { x: -90,  y: 0   },   // top    : rotateX(+90) → pointe -Y → cube rotateX(-90)
  6: { x: 0,    y: 180 },   // back   : rotateY(180) → pointe -Z
}

// 'joker' → face 6 (face arrière = étoile)
const COLOR_FACE_INDEX: Record<string, number> = { g: 1, y: 2, b: 3, p: 4, o: 5, x: 6, joker: 6 }

// Correspondance position CSS → numéro de face (1-based)
const FACE_POSITIONS = [
  { cls: 'front',  faceNum: 1 },
  { cls: 'back',   faceNum: 6 },
  { cls: 'right',  faceNum: 4 },
  { cls: 'left',   faceNum: 3 },
  { cls: 'top',    faceNum: 5 },
  { cls: 'bottom', faceNum: 2 },
]

// ─── Props / Emits ─────────────────────────────────────────────────────────────

const props = defineProps<{
  type: 'color' | 'number' | 'c' | 'n'
  value: ColorFace | NumberFace
  selected?: boolean
  selectable?: boolean
  spinning?: boolean
}>()

defineEmits<{ select: [] }>()

// ─── Computed ──────────────────────────────────────────────────────────────────

const isColorDie = computed(() => props.type === 'color' || props.type === 'c')

const faceDefinitions = computed(() =>
  FACE_POSITIONS.map(({ cls, faceNum }) => {
    const idx = faceNum - 1
    const colorKey = COLOR_LIST[idx] ?? 'x'
    return {
      cls,
      colorHex: COLOR_HEX[colorKey] ?? '#888',
      pips: PIP_POSITIONS[faceNum] ?? [],
      isJoker: faceNum === 6,
    }
  }),
)

// ─── Rotation helpers ──────────────────────────────────────────────────────────

const cubeRef = ref<HTMLElement | null>(null)

function targetRotation() {
  const isJoker = props.value === 'joker'
  const faceNum = isJoker
    ? 6
    : isColorDie.value
      ? (COLOR_FACE_INDEX[props.value as string] ?? 1)
      : Number(props.value)
  return FACE_ROTATION[faceNum] ?? { x: 0, y: 0 }
}

// Positionne le cube sur la bonne face dès le montage
onMounted(() => {
  if (!process.client || !cubeRef.value) return
  const rot = targetRotation()
  gsap.set(cubeRef.value, { rotateX: rot.x, rotateY: rot.y })
})

// Repositionne si la valeur change sans spin (ex : nouveau tirage côté serveur)
watch(
  () => props.value,
  () => {
    if (!cubeRef.value || props.spinning) return
    const rot = targetRotation()
    gsap.set(cubeRef.value, { rotateX: rot.x, rotateY: rot.y })
  },
)

// Animation Spin : reset puis tourne jusqu'à la bonne face
watch(
  () => props.spinning,
  (val) => {
    if (!val || !cubeRef.value || !process.client) return
    const rot = targetRotation()
    const spinX = (3 + Math.floor(Math.random() * 3)) * 360 + rot.x
    const spinY = (3 + Math.floor(Math.random() * 3)) * 360 + rot.y
    gsap.set(cubeRef.value, { rotateX: 0, rotateY: 0 })
    gsap.to(cubeRef.value, { rotateX: spinX, rotateY: spinY, duration: 1.4, ease: 'power4.out' })
  },
)
</script>

<style scoped>
.die-scene {
  position: relative;
  width: 64px;
  height: 64px;
  perspective: 480px;
  cursor: default;
  transition: transform 0.15s ease;
  user-select: none;
  flex-shrink: 0;
}

.die-scene.selectable { cursor: pointer; }
.die-scene.selectable:hover { transform: translateY(-3px); }
.die-scene.selected { transform: translateY(-5px); }

.die-cube {
  width: 64px;
  height: 64px;
  position: relative;
  transform-style: preserve-3d;
}

.die-face {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 30% 25%, #2a2a32 0%, #15151a 60%, #0a0a0e 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    inset 0 -1px 0 rgba(0, 0, 0, 0.5);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.die-face--front  { transform: translateZ(32px); }
.die-face--back   { transform: rotateY(180deg)  translateZ(32px); }
.die-face--right  { transform: rotateY(90deg)   translateZ(32px); }
.die-face--left   { transform: rotateY(-90deg)  translateZ(32px); }
.die-face--top    { transform: rotateX(90deg)   translateZ(32px); }
.die-face--bottom { transform: rotateX(-90deg)  translateZ(32px); }

/* Face joker */
.face-joker-content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.joker-star {
  font-size: 22px;
  line-height: 1;
  color: #f5d742;
  text-shadow: 0 0 10px rgba(245, 215, 66, 0.9), 0 0 20px rgba(245, 215, 66, 0.5);
}

/* Pastille couleur */
.face-color-content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.color-dot {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Grille de pips */
.face-number-content {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 4px;
  width: 44px;
  height: 44px;
  padding: 5px;
  box-sizing: border-box;
}

.pip {
  border-radius: 50%;
}

.pip--on {
  background: radial-gradient(circle at 35% 30%, #ffffff 0%, #d8d8d8 40%, #999 100%);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
}

.pip--off {
  background: transparent;
}

/* Ombre portée sous le dé */
.die-shadow {
  position: absolute;
  bottom: -14px;
  left: 50%;
  transform: translateX(-50%);
  width: 52px;
  height: 12px;
  background: radial-gradient(ellipse, rgba(0, 0, 0, 0.5), transparent 70%);
  pointer-events: none;
}
</style>
