<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

const props = defineProps<{
  color: string
  playerName: string
  status?: 'first' | 'others'  // 'first' = +5, 'others' = +3
}>()
const emit = defineEmits<{ done: [] }>()

const colorMap: Record<string, string> = {
  g: '#5cc96e', y: '#f5d742', b: '#5b9ff5', p: '#e85a82', o: '#f58a35',
}
const colorNameMap: Record<string, string> = {
  g: 'Vert', y: 'Jaune', b: 'Bleu', p: 'Rose', o: 'Orange',
}
const colorHex = computed(() => colorMap[props.color] ?? '#888')
const colorName = computed(() => colorNameMap[props.color] ?? props.color.toUpperCase())
const bonus = computed(() => (props.status === 'others' ? 3 : 5))
const isFirst = computed(() => props.status !== 'others')

const overlayRef = ref<HTMLElement | null>(null)
const ribbonRef = ref<HTMLElement | null>(null)
const tokenRef = ref<HTMLElement | null>(null)

onMounted(async () => {
  if (!import.meta.client) return
  const gsap = (await import('gsap')).default

  gsap.set(overlayRef.value, { opacity: 0 })
  gsap.set(ribbonRef.value, { opacity: 0, y: 24, scale: 0.92 })
  gsap.set(tokenRef.value, { opacity: 0, scale: 0 })

  const tl = gsap.timeline({
    onComplete: () => emit('done'),
  })
  tl.timeScale(2)

  // Fond fade-in
  tl.to(overlayRef.value, { opacity: 1, duration: 0.35, ease: 'power2.out' }, 0)

  // Ribbon entre
  tl.to(ribbonRef.value, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'back.out(2)' }, 0.1)

  // Token pop
  tl.to(tokenRef.value, { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(2.5)' }, 0.4)

  // Token s'envole
  tl.to(tokenRef.value, {
    y: -120, x: 40, scale: 0.35, opacity: 0, duration: 0.8, ease: 'power2.in',
  }, 1.2)

  // Tout disparaît
  tl.to(overlayRef.value, { opacity: 0, duration: 0.45, ease: 'power2.in' }, 2.8)
})
</script>

<template>
  <div ref="overlayRef" class="color-completion-overlay">

    <!-- Ribbon principal -->
    <div
      ref="ribbonRef"
      class="completion-ribbon"
      :style="{ borderColor: colorHex }"
    >
      <!-- Point de couleur -->
      <span class="r-dot" :style="{ background: colorHex }" />

      <!-- Texte -->
      <div class="ribbon-body">
        <span class="ribbon-title">
          <b :style="{ color: colorHex }">{{ colorName }}</b>
          complétée !
        </span>
        <span class="ribbon-sub">
          {{ playerName }}
          <span class="ribbon-badge" :class="{ 'ribbon-badge--others': !isFirst }">
            {{ isFirst ? 'PREMIER' : 'À TON TOUR' }}
          </span>
        </span>
      </div>
    </div>

    <!-- Token bonus -->
    <div ref="tokenRef" class="bonus-token" :style="{ borderColor: colorHex }">
      <span class="bt-dot" :style="{ background: colorHex }" />
      <span class="bt-num" :style="{ color: colorHex }">+{{ bonus }}</span>
    </div>

  </div>
</template>

<style scoped>
.color-completion-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 15, 19, 0.72);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  z-index: 9999;
  pointer-events: none;
}

/* ── Ribbon ── */
.completion-ribbon {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 24px;
  border-radius: 99px;
  background: rgba(15, 15, 19, 0.94);
  border: 1px solid #2e2e3e; /* overridden via :style */
  box-shadow: 0 8px 36px rgba(0, 0, 0, 0.55);
  font-family: 'Space Mono', monospace;
}

.r-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ribbon-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ribbon-title {
  font-family: 'Space Mono', monospace;
  font-weight: 700;
  font-size: 18px;
  color: #e8e8f0;
  line-height: 1;
}
.ribbon-title b { -webkit-text-fill-color: unset; }

.ribbon-sub {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'Nunito', sans-serif;
  font-size: 13px;
  color: #9a9ab0;
}

.ribbon-badge {
  font-family: 'Space Mono', monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 2px 7px;
  border-radius: 99px;
  background: rgba(92, 201, 110, 0.18);
  color: #5cc96e;
}

.ribbon-badge--others {
  background: rgba(232, 90, 130, 0.18);
  color: #e85a82;
}

/* ── Token ── */
.bonus-token {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 16px;
  border-radius: 99px;
  background: #1a1a24;
  border: 1px solid #2e2e3e; /* overridden via :style */
  font-family: 'Space Mono', monospace;
  font-weight: 700;
}

.bt-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
}

.bt-num {
  font-size: 18px;
}
</style>
