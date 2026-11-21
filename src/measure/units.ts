/** Length helpers. Internally everything is cm; Pakistani users often think in feet and inches. */

export const CM_PER_INCH = 2.54
export const CM_PER_FOOT = 30.48

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / CM_PER_INCH)
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 }
}

export function feetInchesToCm(feet: number, inches: number): number {
  return feet * CM_PER_FOOT + inches * CM_PER_INCH
}

export function formatFeet(cm: number): string {
  const { feet, inches } = cmToFeetInches(cm)
  return inches === 0 ? `${feet}′` : `${feet}′ ${inches}″`
}

export function formatCm(cm: number): string {
  return `${Math.round(cm)} cm`
}

/** "412 cm (13′ 6″)" */
export function formatBoth(cm: number): string {
  return `${formatCm(cm)} (${formatFeet(cm)})`
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
