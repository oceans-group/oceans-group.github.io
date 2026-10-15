/** Versión de la app en ejecución (commit del build) y fecha del build */
export const APP_VERSION = __APP_VERSION__
export const APP_BUILT_AT = __APP_BUILT_AT__

const CHECK_EVERY_MS = 10 * 60 * 1000
const RELOAD_GUARD = 'oceans_reloaded_for_version'

async function publishedVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { version?: string }
    return data.version ?? null
  } catch {
    return null
  }
}

/**
 * Si hay una versión publicada distinta de la que corre, recarga la página. Cambia la URL (?v=…) para que el
 * navegador no use el index.html guardado; si aun así vuelve la versión vieja, no insiste (evita un bucle).
 */
export async function checkForUpdate(): Promise<void> {
  if (import.meta.env.DEV) return
  const latest = await publishedVersion()
  if (!latest || latest === APP_VERSION) return
  let alreadyTried: string | null = null
  try { alreadyTried = sessionStorage.getItem(RELOAD_GUARD) } catch { /* almacenamiento bloqueado */ }
  if (alreadyTried === latest) return
  try { sessionStorage.setItem(RELOAD_GUARD, latest) } catch { /* almacenamiento bloqueado */ }
  const url = new URL(window.location.href)
  url.searchParams.set('v', latest)
  window.location.replace(url.toString())
}

/** Revisa al abrir, al volver a la pestaña y cada 10 minutos */
export function watchForUpdates(): void {
  void checkForUpdate()
  window.setInterval(() => void checkForUpdate(), CHECK_EVERY_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate()
  })
}
