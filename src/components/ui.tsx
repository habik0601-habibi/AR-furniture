import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'ink' | 'ghost' | 'outline' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-clay text-white hover:bg-clay-2 shadow-soft',
  ink: 'bg-ink text-paper hover:bg-ink-2 shadow-soft',
  ghost: 'bg-transparent text-ink hover:bg-paper-2',
  outline: 'bg-card text-ink border border-line hover:border-ink-2',
  danger: 'bg-danger text-white hover:opacity-90',
}

export function Button({
  variant = 'ink',
  size = 'md',
  icon,
  iconRight,
  busy,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  icon?: IconName
  iconRight?: IconName
  busy?: boolean
}) {
  const sizes = { sm: 'h-9 px-3 text-sm gap-1.5', md: 'h-11 px-4 text-[15px] gap-2', lg: 'h-13 px-6 text-base gap-2.5' }
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center rounded-full font-semibold transition-colors disabled:opacity-50 select-none',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={busy || rest.disabled}
      {...rest}
    >
      {busy ? <Spinner small /> : icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} /> : null}
      {children}
      {iconRight && !busy ? <Icon name={iconRight} size={size === 'sm' ? 16 : 18} /> : null}
    </button>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-2xl border border-line bg-card shadow-soft', className)}>{children}</div>
}

export function Spinner({ small, className }: { small?: boolean; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cx(
        'inline-block animate-spin rounded-full border-2 border-current border-t-transparent',
        small ? 'h-4 w-4' : 'h-6 w-6',
        className,
      )}
    />
  )
}

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info'
const tones: Record<Tone, string> = {
  neutral: 'bg-paper-2 text-ink-2',
  good: 'bg-sage-soft text-sage',
  warn: 'bg-amber-soft text-amber',
  bad: 'bg-danger-soft text-danger',
  info: 'bg-paper-2 text-ink',
}
const toneIcon: Record<Tone, IconName> = { neutral: 'info', good: 'check', warn: 'alert', bad: 'x', info: 'info' }

export function Badge({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: IconName | false; children: ReactNode; className?: string }) {
  const ic = icon === false ? null : icon ?? toneIcon[tone]
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', tones[tone], className)}>
      {ic && <Icon name={ic} size={14} />}
      {children}
    </span>
  )
}

export function Notice({ tone = 'info', title, children, className }: { tone?: Tone; title?: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex gap-3 rounded-xl p-3.5 text-sm', tones[tone], className)} role={tone === 'bad' ? 'alert' : undefined}>
      <Icon name={toneIcon[tone]} size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange(v: NoInfer<T>): void
  options: { value: NoInfer<T>; label: string }[]
  label: string
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex rounded-full bg-paper-2 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'min-h-9 rounded-full px-3.5 text-sm font-semibold transition-colors',
            value === o.value ? 'bg-card text-ink shadow-soft' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink">{label}</span>
      {hint && <span className="ml-1.5 text-xs text-muted">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

export const inputClass =
  'w-full h-11 rounded-xl border border-line bg-card px-3 text-[15px] text-ink placeholder:text-muted focus:border-ink-2 focus:outline-none'

export function Kicker({ children }: { children: ReactNode }) {
  return <p className="text-xs font-bold uppercase tracking-[0.14em] text-clay">{children}</p>
}

export function Meter({ value, tone }: { value: number; tone: Tone }) {
  const bar = { good: 'bg-sage', warn: 'bg-amber', bad: 'bg-danger', neutral: 'bg-ink-2', info: 'bg-ink' }[tone]
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-paper-2" role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-[width] duration-500', bar)} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  )
}
