<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

const props = defineProps<{
  column: string      // lettre A–O
  playerName: string
  points: number      // valeur du bonus selon first/others
  status?: 'first' | 'others'
}>()
const emit = defineEmits<{ done: [] }>()

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

  const tl = gsap.timeline({ onComplete: () => emit('done') })

  tl.to(overlayRef.value, { opacity: 1, duration: 0.35, ease: 'power2.out' }, 0)
  tl.to(ribbonRef.value, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'back.out(2)' }, 0.1)
  tl.to(tokenRef.value, { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(2.5)' }, 0.4)
  tl.to(tokenRef.value, {
    y: -120, x: 40, scale: 0.35, opacity: 0, duration: 0.8, ease: 'power2.in',
  }, 1.2)
  tl.to(overlayRef.value, { opacity: 0, duration: 0.45, ease: 'power2.in' }, 2.8)
})
</script>

<template>
  <div ref="overlayRef" class="column-completion-overlay">

    <!-- Ribbon principal -->
    <div ref="ribbonRef" class="completion-ribbon">
      <!-- Badge colonne -->
      <span class="col-badge">{{ column }}</span>

      <!-- Texte -->
      <div class="ribbon-body">
        <span class="ribbon-title">
          Colonne <b class="col-accent">{{ column }}</b> complétée !
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
    <div ref="tokenRef" class="bonus-token">
      <span class="col-badge col-badge--sm">{{ column }}</span>
      <span class="bt-num">+{{ points }}</span>
    </div>

  </div>
</template>

<style scoped>
.column-completion-overlay {
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
  border: 1px solid #f5d742;
  box-shadow: 0 8px 36px rgba(0, 0, 0, 0.55), 0 0 24px rgba(245, 215, 66, 0.12);
}

/* ── Badge colonne ── */
.col-badge {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  color: #0f0f13;
  font-family: 'Space Mono', monospace;
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}

.col-badge--sm {
  width: 22px;
  height: 22px;
  font-size: 11px;
  border-radius: 6px;
}

/* ── Corps ribbon ── */
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

.col-accent {
  background: linear-gradient(135deg, #f5d742, #f58a35);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

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
  border: 1px solid #f5d742;
  font-family: 'Space Mono', monospace;
  font-weight: 700;
}

.bt-num {
  font-size: 18px;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
</style>
