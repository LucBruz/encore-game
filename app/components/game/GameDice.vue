<template>
  <div
    class="die-scene"
    :class="{ selected, selectable }"
    @click="selectable && $emit('select')"
  >
    <div ref="cubeRef" class="die-cube">
      <!-- Front = face 1 -->
      <div class="die-face die-face--front">
        <DiceFaceContent :type="type" :face-index="0" />
      </div>
      <!-- Back = face 6 -->
      <div class="die-face die-face--back">
        <DiceFaceContent :type="type" :face-index="5" />
      </div>
      <!-- Right = face 4 -->
      <div class="die-face die-face--right">
        <DiceFaceContent :type="type" :face-index="3" />
      </div>
      <!-- Left = face 3 -->
      <div class="die-face die-face--left">
        <DiceFaceContent :type="type" :face-index="2" />
      </div>
      <!-- Top = face 5 -->
      <div class="die-face die-face--top">
        <DiceFaceContent :type="type" :face-index="4" />
      </div>
      <!-- Bottom = face 2 -->
      <div class="die-face die-face--bottom">
        <DiceFaceContent :type="type" :face-index="1" />
      </div>
    </div>
    <div class="die-shadow" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, defineComponent, h } from 'vue'
import gsap from 'gsap'
import type { ColorKey } from '~/data/grids/grid-01'
import type { ColorFace, NumberFace } from '~/stores/gameStore'

// ─── Constants ────────────────────────────────────────────────────────────────

const COLOR_LIST: (ColorKey | 'x')[] = ['g', 'y', 'b', 'p', 'o', 'x']

const COLOR_HEX: Record<string, string> = {
  g: '#5cc96e',
  y: '#f5d742',
  b: '#5b9ff5',
  p: '#e85a82',
  o: '#f58a35',
  x: '#888888',
}

// Pip positions (0–8 in a 3×3 grid) for each face value 1–6
const PIP_POSITIONS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

// Final rotation for each face index 1–6
const FACE_ROTATION: Record<number, { x: number; y: number }> = {
  1: { x: 0,   y: 0   },
  2: { x: -90, y: 0   },
  3: { x: 0,   y: -90 },
  4: { x: 0,   y: 90  },
  5: { x: 90,  y: 0   },
  6: { x: 0,   y: 180 },
}

// Maps color key → face number (1-based)
const COLOR_FACE_INDEX: Record<string, number> = {
  g: 1,
  y: 2,
  b: 3,
  p: 4,
  o: 5,
  x: 6,
}

// ─── Inner component: renders the content of a single face ───────────────────

const DiceFaceContent = defineComponent({
  name: 'DiceFaceContent',
  props: {
    type: { type: String as () => 'color' | 'number' | 'c' | 'n', required: true },
    faceIndex: { type: Number, required: true }, // 0-based
  },
  setup(props) {
    return () => {
      const isColor = props.type === 'color' || props.type === 'c'
      if (isColor) {
        const colorKey = COLOR_LIST[props.faceIndex] ?? 'x'
        const hex = COLOR_HEX[colorKey] ?? '#888'
        return h('div', { class: 'face-color-content' }, [
          h('div', {
            class: 'color-dot',
            style: {
              background: hex,
              boxShadow: `0 0 12px 4px ${hex}66, 0 0 24px 8px ${hex}33`,
            },
          }),
        ])
      } else {
        // Number face — faceIndex 0-based → value 1-based
        const value = props.faceIndex + 1
        const activePips = PIP_POSITIONS[value] ?? []
        return h(
          'div',
          { class: 'face-number-content' },
          Array.from({ length: 9 }, (_, i) =>
            h('div', {
              class: ['pip', activePips.includes(i) ? 'pip--on' : 'pip--off'],
            }),
          ),
        )
      }
    }
  },
})

// ─── Props / Emits ────────────────────────────────────────────────────────────

const props = defineProps<{
  type: 'color' | 'number' | 'c' | 'n'
  value: ColorFace | NumberFace
  selected?: boolean
  selectable?: boolean
  spinning?: boolean
}>()

defineEmits<{ select: [] }>()

// ─── Template ref ─────────────────────────────────────────────────────────────

const cubeRef = ref<HTMLElement | null>(null)

// ─── Spin animation ───────────────────────────────────────────────────────────

watch(
  () => props.spinning,
  (val) => {
    if (!val || !cubeRef.value) return
    if (!process.client) return

    const isNumber = props.type === 'number' || props.type === 'n'
    const faceIndex: number = isNumber
      ? Number(props.value)
      : COLOR_FACE_INDEX[props.value as string] ?? 1

    const finalRot = FACE_ROTATION[faceIndex] ?? { x: 0, y: 0 }
    const spinX = (3 + Math.floor(Math.random() * 3)) * 360 + finalRot.x
    const spinY = (3 + Math.floor(Math.random() * 3)) * 360 + finalRot.y

    gsap.set(cubeRef.value, { rotateX: 0, rotateY: 0 })
    gsap.to(cubeRef.value, {
      rotateX: spinX,
      rotateY: spinY,
      duration: 1.4,
      ease: 'power4.out',
    })
  },
)
</script>

<style scoped>
/* ─── Scene wrapper ─────────────────────────────────────────────────────────── */
.die-scene {
  position: relative;
  width: 80px;
  height: 80px;
  perspective: 1000px;
  cursor: default;
  transition: transform 0.15s ease;
  user-select: none;
}

.die-scene.selectable {
  cursor: pointer;
}

.die-scene.selectable:hover {
  transform: translateY(-2px);
}

.die-scene.selected {
  transform: translateY(-4px);
}

/* ─── Cube ──────────────────────────────────────────────────────────────────── */
.die-cube {
  width: 80px;
  height: 80px;
  position: relative;
  transform-style: preserve-3d;
}

/* ─── Faces ─────────────────────────────────────────────────────────────────── */
.die-face {
  position: absolute;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 30% 25%, #2a2a32 0%, #15151a 60%, #0a0a0e 100%);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    inset 0 -1px 0 rgba(0, 0, 0, 0.4),
    inset 1px 0 rgba(255, 255, 255, 0.04),
    inset -1px 0 rgba(0, 0, 0, 0.3);
  backface-visibility: hidden;
}

.die-face--front  { transform: translateZ(40px); }
.die-face--back   { transform: rotateY(180deg) translateZ(40px); }
.die-face--right  { transform: rotateY(90deg) translateZ(40px); }
.die-face--left   { transform: rotateY(-90deg) translateZ(40px); }
.die-face--top    { transform: rotateX(90deg) translateZ(40px); }
.die-face--bottom { transform: rotateX(-90deg) translateZ(40px); }

/* ─── Color face content ────────────────────────────────────────────────────── */
.face-color-content {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.color-dot {
  width: 48px;
  height: 48px;
  border-radius: 50%;
}

/* ─── Number face content (pip grid) ────────────────────────────────────────── */
.face-number-content {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 4px;
  width: 56px;
  height: 56px;
  padding: 4px;
}

.pip {
  width: 100%;
  height: 100%;
  border-radius: 50%;
}

.pip--on {
  background: radial-gradient(circle at 35% 30%, #fff 0%, #d8d8d8 40%, #888 100%);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}

.pip--off {
  background: transparent;
}

/* ─── Shadow ────────────────────────────────────────────────────────────────── */
.die-shadow {
  position: absolute;
  bottom: -22px;
  left: 0;
  width: 80px;
  height: 20px;
  background: radial-gradient(ellipse, rgba(0, 0, 0, 0.55), transparent 70%);
  pointer-events: none;
}
</style>