import { ref } from 'vue'

// ─── COMPOSABLE ───────────────────────────────────────────────────────────────

export function useTurnTimer() {
    const secondsLeft = ref(60)
    const totalDuration = ref(60)
    const isRunning = ref(false)
    let intervalId: ReturnType<typeof setInterval> | null = null

    // ── START ──────────────────────────────────────────────────────────────────

    function start(duration: number, onExpire: () => void): void {
        if (intervalId !== null) {
            clearInterval(intervalId)
            intervalId = null
        }

        secondsLeft.value = duration
        totalDuration.value = duration
        isRunning.value = true

        intervalId = setInterval(() => {
            secondsLeft.value--

            if (secondsLeft.value <= 0) {
                stop()
                onExpire()
            }
        }, 1000)
    }

    // ── STOP ───────────────────────────────────────────────────────────────────

    function stop(): void {
        if (intervalId !== null) {
            clearInterval(intervalId)
            intervalId = null
        }
        isRunning.value = false
    }

    // ── RESET ──────────────────────────────────────────────────────────────────

    function reset(duration: number, onExpire: () => void): void {
        stop()
        start(duration, onExpire)
    }

    return {
        secondsLeft,
        totalDuration,
        isRunning,
        start,
        stop,
        reset,
    }
}
