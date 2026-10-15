// Forge answers shared by every session on the same machine: Claude Code sessions on one repo
// (several at once under a session manager) ask glab or gh once, not once each.

/** A listing younger than this is reused: just under the 2-minute recheck. */
export const listMaxAgeMs = 100_000
/** Pipeline details younger than this are reused: just under the 30 s poll. */
export const detailsMaxAgeMs = 25_000

export interface CacheEnv {
  xdgCacheHome: string | null
  home: string | null
  localAppData: string | null
}

/** $XDG_CACHE_HOME, else ~/.cache, else %LOCALAPPDATA% on Windows, then claude-code-mods/merge-status. */
export function cacheDir(env: CacheEnv): string | null {
  const set = (value: string | null): string | null => (value === null || value === '' ? null : value)
  const base =
    set(env.xdgCacheHome) ?? (set(env.home) === null ? null : `${env.home}/.cache`) ?? set(env.localAppData)
  return base === null ? null : `${base}/claude-code-mods/merge-status`
}

/** One file per question: the remote it goes to and the command that asks it. */
export function cachePath(dir: string, remoteUrl: string, argv: readonly string[]): string {
  return `${dir}/${fnv1a([remoteUrl, ...argv].join('\u0000'))}.json`
}

/** The stdout a file holds when it was written at most `maxAgeMs` ago; null for anything else. */
export function freshStdout(text: string, now: number, maxAgeMs: number): string | null {
  try {
    const entry: unknown = JSON.parse(text)
    if (typeof entry !== 'object' || entry === null) return null
    const { at, stdout } = entry as { at?: unknown; stdout?: unknown }
    if (typeof at !== 'number' || typeof stdout !== 'string') return null
    return now - at >= 0 && now - at < maxAgeMs ? stdout : null
  } catch {
    return null
  }
}

export function cacheEntry(now: number, stdout: string): string {
  return JSON.stringify({ at: now, stdout })
}

/** 64-bit FNV-1a as 16 hex digits: the same name in every session. */
function fnv1a(text: string): string {
  let hash = 0xcbf29ce484222325n
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte)
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return hash.toString(16).padStart(16, '0')
}
