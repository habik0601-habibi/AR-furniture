/**
 * How many times the "how to move it in AR" guide has been shown, so it appears
 * for the first few AR launches and then gets out of the way. The count lives in
 * localStorage; where storage is blocked (private mode, some third-party frames)
 * it falls back to a counter that lasts until the page is reloaded.
 */
const KEY = 'roomsense-ar-guide-shown'

/** The guide is shown for this many AR launches per browser. */
export const AR_GUIDE_MAX = 3

type Store = Pick<Storage, 'getItem' | 'setItem'>

let memoryCount = 0

function defaultStorage(): Store | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

export function arGuideCount(storage: Store | undefined = defaultStorage()): number {
  if (storage) {
    try {
      return Math.max(0, Number.parseInt(storage.getItem(KEY) ?? '0', 10) || 0)
    } catch {
      /* storage unusable: use the in-memory count */
    }
  }
  return memoryCount
}

export function shouldShowArGuide(storage: Store | undefined = defaultStorage()): boolean {
  return arGuideCount(storage) < AR_GUIDE_MAX
}

export function noteArGuideShown(storage: Store | undefined = defaultStorage()): void {
  memoryCount += 1
  if (!storage) return
  try {
    storage.setItem(KEY, String(arGuideCount(storage) + 1))
  } catch {
    /* in-memory count already updated */
  }
}

/** Test helper: forget the in-memory count. */
export function resetArGuideMemory(): void {
  memoryCount = 0
}
