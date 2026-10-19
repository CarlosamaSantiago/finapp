import { parseAmountInput } from '@finapp/contracts';
import { useId, useState, type ReactNode } from 'react';
import { ApiError } from './api.js';
import { formatMoney } from './format.js';
import { errorMessages } from './i18n.js';

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}

export function Card({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>
      {title && (
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-500">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  minor,
  tone = 'neutral',
}: {
  label: string;
  minor: number;
  tone?: 'neutral' | 'good' | 'bad';
}) {
  const color =
    tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-rose-700' : 'text-stone-900';
  return (
    <div>
      <div className="text-sm text-stone-500">{label}</div>
      <div className={`amount mt-1 text-2xl font-semibold ${color}`}>{formatMoney(minor)}</div>
    </div>
  );
}

export function Amount({ minor, className = '' }: { minor: number; className?: string }) {
  return (
    <span className={`amount ${minor < 0 ? 'text-rose-700' : ''} ${className}`}>
      {formatMoney(minor)}
    </span>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger';
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const styles = {
    primary: 'bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-stone-300',
    ghost: 'text-stone-700 hover:bg-stone-100 disabled:text-stone-300',
    danger: 'text-rose-700 hover:bg-rose-50 disabled:text-stone-300',
  }[variant];
  return (
    <button
      type="button"
      {...props}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
    />
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: (id: string) => ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-stone-700">
        {label}
      </label>
      {children(id)}
      {hint && <span className="text-xs text-stone-500">{hint}</span>}
    </div>
  );
}

export const inputClass =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20';

export function Select<T extends string | number>({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string;
  value: T | '';
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  placeholder?: string;
}) {
  return (
    <select
      id={id}
      className={inputClass}
      value={String(value)}
      onChange={(e) => {
        const match = options.find((o) => String(o.value) === e.target.value);
        if (match) onChange(match.value);
      }}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Text input for es-CO amounts; reports minor units, or null while the text is not a valid amount. */
export function MoneyInput({
  id,
  onChange,
  allowNegative = false,
}: {
  id: string;
  onChange: (minor: number | null) => void;
  allowNegative?: boolean;
}) {
  const [text, setText] = useState('');
  const minor = text === '' ? null : parseAmountInput(text);
  const invalid = text !== '' && (minor === null || (!allowNegative && minor < 0));
  return (
    <div>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        className={`${inputClass} amount ${invalid ? 'border-rose-400' : ''}`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = e.target.value === '' ? null : parseAmountInput(e.target.value);
          onChange(parsed !== null && (allowNegative || parsed >= 0) ? parsed : null);
        }}
      />
      <div className="mt-1 h-4 text-xs text-stone-500">
        {invalid ? 'Usa el formato 1.250.000,50' : minor !== null ? formatMoney(minor) : ''}
      </div>
    </div>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  const messages =
    error instanceof ApiError ? errorMessages(error.body) : ['Ocurrió un error inesperado.'];
  return (
    <div
      role="alert"
      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
    >
      {messages.map((m) => (
        <p key={m}>{m}</p>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-stone-500">{children}</p>;
}

export function Loading() {
  return <p className="py-6 text-center text-sm text-stone-400">Cargando…</p>;
}
