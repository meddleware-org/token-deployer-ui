import { ref, watch, type Ref } from 'vue'

/**
 * Colour-mode state manager (light | dark | system). Sets `data-theme` on
 * <html>, persists the choice, and follows the OS in `system` mode.
 *
 * Vendored mirror of `@meddleware/ui`'s `useColorMode` for visual/UX parity with
 * the dashboard — this repo is self-contained (no cross-repo links).
 * TODO(unify): consume `@meddleware/ui` once it is published.
 */

export type ColorMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'sui-deployer:color-mode'

const mode: Ref<ColorMode> = ref<ColorMode>('system')
let initialized = false

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

function resolveDark(m: ColorMode): boolean {
  return m === 'dark' || (m === 'system' && systemPrefersDark())
}

function apply(m: ColorMode): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', resolveDark(m) ? 'dark' : 'light')
}

export function useColorMode(defaultMode: ColorMode = 'system') {
  if (!initialized) {
    initialized = true
    let stored: ColorMode | null = null
    try {
      stored =
        typeof localStorage !== 'undefined'
          ? (localStorage.getItem(STORAGE_KEY) as ColorMode | null)
          : null
    } catch {
      /* no storage — ignore */
    }
    mode.value = stored ?? defaultMode
    apply(mode.value)

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (mode.value === 'system') apply('system')
      })
    }

    watch(mode, (m) => {
      apply(m)
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, m)
      } catch {
        /* ignore */
      }
    })
  }

  function set(m: ColorMode): void {
    mode.value = m
  }

  function cycle(): void {
    set(mode.value === 'light' ? 'dark' : mode.value === 'dark' ? 'system' : 'light')
  }

  return { mode, set, cycle, isDark: () => resolveDark(mode.value) }
}
