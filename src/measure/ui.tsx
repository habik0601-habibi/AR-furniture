/** Small shared UI pieces for the measurement module (Tailwind, inline SVG icons). */
import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cmToFeetInches, feetInchesToCm } from './units'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500',
  secondary:
    'bg-white text-slate-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-white text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50',
}

export function Btn({
  variant = 'secondary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

const paths: Record<string, ReactNode> = {
  cube: <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 0v10m0 0 9-5m-9 5-9-5m9 5v10" />,
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  ruler: <path d="m3 17 14-14 4 4L7 21l-4-4Zm4-4 2 2m1-5 2 2m1-5 2 2" />,
  undo: <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
  restart: <path d="M4 4v6h6M20 20v-6h-6M5.5 15a7.5 7.5 0 0 0 13.3 2M18.5 9A7.5 7.5 0 0 0 5.2 7" />,
  check: <path d="m5 12 5 5 9-10" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  back: <path d="M15 5 8 12l7 7" />,
  sparkle: <path d="M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  door: <path d="M5 21V4a1 1 0 0 1 1-1h9v18M3 21h18M15 3l4 2v16M12 12h.01" />,
  window: <path d="M4 4h16v16H4zM12 4v16M4 12h16" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" />,
  info: <path d="M12 8h.01M11 12h1v5h1M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />,
  swap: <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4m4 4H7" />,
  upload: <path d="M12 16V4m0 0L7 9m5-5 5 5M4 20h16" />,
}

export function Icon({ name, className = 'h-5 w-5' }: { name: keyof typeof paths | string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

/** "Step 2 of 5" indicator with labelled dots. */
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <nav aria-label="Progress" className="mb-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        Step {current + 1} of {steps.length}: <span className="text-slate-900">{steps[current]}</span>
      </p>
      <ol className="flex gap-1.5">
        {steps.map((s, i) => (
          <li
            key={s}
            aria-current={i === current ? 'step' : undefined}
            className={`h-1.5 flex-1 rounded-full ${i < current ? 'bg-slate-900' : i === current ? 'bg-orange-500' : 'bg-slate-200'}`}
          >
            <span className="sr-only">{s}</span>
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error'; children: ReactNode }) {
  const cls =
    tone === 'error'
      ? 'bg-red-50 text-red-800 ring-red-200'
      : tone === 'warn'
        ? 'bg-amber-50 text-amber-900 ring-amber-200'
        : 'bg-sky-50 text-sky-900 ring-sky-200'
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-2 rounded-xl p-3 text-sm ring-1 ring-inset ${cls}`}>
      <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

export type LengthUnit = 'cm' | 'ft'

export function UnitToggle({ unit, onChange }: { unit: LengthUnit; onChange(u: LengthUnit): void }) {
  return (
    <div role="radiogroup" aria-label="Units" className="inline-flex rounded-xl bg-slate-100 p-1">
      {(['cm', 'ft'] as const).map((u) => (
        <button
          key={u}
          type="button"
          role="radio"
          aria-checked={unit === u}
          onClick={() => onChange(u)}
          className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${unit === u ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
        >
          {u === 'cm' ? 'cm' : 'ft / in'}
        </button>
      ))}
    </div>
  )
}

const inputCls =
  'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-200'

/** A length field that stores cm but can be edited in cm or feet + inches. */
export function LengthInput({
  label,
  valueCm,
  onChange,
  unit,
  min = 0,
  hint,
}: {
  label: string
  valueCm: number
  onChange(cm: number): void
  unit: LengthUnit
  min?: number
  hint?: string
}) {
  const id = useId()
  const { feet, inches } = cmToFeetInches(valueCm)
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {unit === 'cm' ? (
        <div className="relative">
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={min}
            value={Number.isFinite(valueCm) ? Math.round(valueCm) : ''}
            onChange={(e) => onChange(Number(e.target.value))}
            className={`${inputCls} pr-12`}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">cm</span>
        </div>
      ) : (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              id={id}
              type="number"
              inputMode="numeric"
              min={0}
              value={feet}
              aria-label={`${label}, feet`}
              onChange={(e) => onChange(feetInchesToCm(Number(e.target.value), inches))}
              className={`${inputCls} pr-9`}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">ft</span>
          </div>
          <div className="relative flex-1">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={11}
              value={inches}
              aria-label={`${label}, inches`}
              onChange={(e) => onChange(feetInchesToCm(feet, Number(e.target.value)))}
              className={`${inputCls} pr-9`}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">in</span>
          </div>
        </div>
      )}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = value >= 0.8 ? 'bg-emerald-500' : value >= 0.6 ? 'bg-amber-500' : 'bg-red-500'
  const word = value >= 0.8 ? 'High' : value >= 0.6 ? 'Medium' : 'Low'
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-medium text-slate-700">Confidence</span>
        <span className="text-slate-600">
          {word} ({pct}%)
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-slate-200"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Measurement confidence"
      >
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
