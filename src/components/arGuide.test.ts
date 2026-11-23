import { beforeEach, describe, expect, it } from 'vitest'
import { AR_GUIDE_MAX, arGuideCount, noteArGuideShown, resetArGuideMemory, shouldShowArGuide } from './arGuide'

function fakeStorage() {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}
const blockedStorage = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('SecurityError')
  },
}

describe('AR guide counter', () => {
  beforeEach(() => resetArGuideMemory())

  it('shows the guide for the first few launches, then stops', () => {
    const s = fakeStorage()
    for (let i = 0; i < AR_GUIDE_MAX; i++) {
      expect(shouldShowArGuide(s)).toBe(true)
      noteArGuideShown(s)
    }
    expect(arGuideCount(s)).toBe(AR_GUIDE_MAX)
    expect(shouldShowArGuide(s)).toBe(false)
  })

  it('keeps counting per browser, not per call', () => {
    const a = fakeStorage()
    const b = fakeStorage()
    noteArGuideShown(a)
    expect(arGuideCount(a)).toBe(1)
    expect(arGuideCount(b)).toBe(0)
  })

  it('still limits the guide when storage is blocked, using an in-memory count', () => {
    for (let i = 0; i < AR_GUIDE_MAX; i++) {
      expect(shouldShowArGuide(blockedStorage)).toBe(true)
      noteArGuideShown(blockedStorage)
    }
    expect(shouldShowArGuide(blockedStorage)).toBe(false)
  })

  it('treats a damaged stored value as zero', () => {
    const s = fakeStorage()
    s.setItem('roomsense-ar-guide-shown', 'abc')
    expect(arGuideCount(s)).toBe(0)
    expect(shouldShowArGuide(s)).toBe(true)
  })
})
