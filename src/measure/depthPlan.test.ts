import { describe, expect, it } from 'vitest'
import { buildPlans, isPhoneLike, SIZE_DESKTOP, SIZE_LOW, SIZE_PHONE } from './depthPlan'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'

describe('phone detection', () => {
  it('recognises iPhone and Android', () => {
    expect(isPhoneLike({ userAgent: IPHONE })).toBe(true)
    expect(isPhoneLike({ userAgent: ANDROID })).toBe(true)
  })
  it('treats an iPad that reports as a Mac as a tablet, but a real Mac as a computer', () => {
    expect(isPhoneLike({ userAgent: MAC, maxTouchPoints: 5 })).toBe(true)
    expect(isPhoneLike({ userAgent: MAC, maxTouchPoints: 0 })).toBe(false)
  })
  it('treats a Windows computer as a computer, and low-memory devices as phone-like', () => {
    expect(isPhoneLike({ userAgent: WINDOWS, deviceMemory: 16 })).toBe(false)
    expect(isPhoneLike({ userAgent: WINDOWS, deviceMemory: 4 })).toBe(true)
    expect(isPhoneLike(undefined)).toBe(false)
  })
})

describe('depth model ladder', () => {
  it('never uses WebGPU on a phone, and starts at the phone size', () => {
    const plans = buildPlans({ phone: true, webgpu: true })
    expect(plans.every((p) => p.device === 'wasm')).toBe(true)
    expect(plans.map((p) => p.size)).toEqual([SIZE_PHONE, SIZE_LOW])
  })
  it('uses WebGPU first on a computer that has it, then steps down on the CPU', () => {
    const plans = buildPlans({ phone: false, webgpu: true })
    expect(plans[0]).toEqual({ device: 'webgpu', dtype: 'fp16', size: SIZE_DESKTOP })
    expect(plans.slice(1).map((p) => p.size)).toEqual([SIZE_DESKTOP, SIZE_PHONE, SIZE_LOW])
  })
  it('goes straight to the CPU on a computer without WebGPU', () => {
    const plans = buildPlans({ phone: false, webgpu: false })
    expect(plans[0].device).toBe('wasm')
    expect(plans).toHaveLength(3)
  })
  it('only ever gets lighter down the ladder, and sizes fit the 14 px patch grid', () => {
    for (const phone of [true, false]) {
      const cpu = buildPlans({ phone, webgpu: false })
      for (let i = 1; i < cpu.length; i++) expect(cpu[i].size).toBeLessThan(cpu[i - 1].size)
      for (const p of cpu) expect(p.size % 14).toBe(0)
    }
  })
})
