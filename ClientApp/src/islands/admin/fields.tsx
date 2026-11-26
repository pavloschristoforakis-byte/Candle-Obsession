// Small form building blocks for the admin product editor.
import { useId, useState, type ReactNode } from 'react';

export function Icon({ id }: { id: string }) {
  return (
    <svg className="icon" aria-hidden="true">
      <use href={`#i-${id}`} />
    </svg>
  );
}

/** A labelled field with an optional hint and the server's error message underneath. */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
}) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`form-group${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <small id={`${id}-hint`} className="pa-hint">
          {hint}
        </small>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  placeholder,
  maxLength,
  multiline,
  disabled,
  type = 'text',
}: {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  disabled?: boolean;
  type?: 'text' | 'url';
}) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(a) =>
        multiline ? (
          <textarea {...a} rows={5} value={value ?? ''} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input
            {...a}
            type="text"
            inputMode={type === 'url' ? 'url' : undefined}
            value={value ?? ''}
            maxLength={maxLength}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
            onChange={(e) => onChange(e.target.value)}
          />
        )
      }
    </Field>
  );
}

/** Number box that keeps what you type (so "12." or an empty box don't jump around) and reports a number or null. */
export function NumberField({
  label,
  value,
  onChange,
  hint,
  error,
  step = 1,
  min = 0,
  placeholder,
  prefix,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  hint?: string;
  error?: string;
  step?: number;
  min?: number;
  placeholder?: string;
  prefix?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? '' : String(value));
  return (
    <Field label={label} hint={hint} error={error}>
      {(a) => (
        <span className={prefix ? 'pa-prefixed' : undefined}>
          {prefix && <span aria-hidden="true">{prefix}</span>}
          <input
            {...a}
            type="number"
            inputMode={step < 1 ? 'decimal' : 'numeric'}
            step={step}
            min={min}
            value={shown}
            placeholder={placeholder}
            onChange={(e) => {
              setDraft(e.target.value);
              const n = e.target.value === '' ? null : Number(e.target.value);
              onChange(n !== null && Number.isFinite(n) ? n : null);
            }}
            onBlur={() => setDraft(null)}
          />
        </span>
      )}
    </Field>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
  error?: string;
}) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(a) => (
        <select {...a} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

/** A list of short texts shown as removable chips (scent words, notes, answers…). Enter or a comma adds one. */
export function ListField({
  label,
  values,
  onChange,
  hint,
  error,
  placeholder,
  addLabel = 'Add',
  long = false,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  hint?: string;
  error?: string;
  placeholder?: string;
  addLabel?: string;
  /** Longer entries (sentences): shown as rows instead of chips, and commas don't split them. */
  long?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const parts = (long ? [draft] : draft.split(',')).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    onChange([...values, ...parts.filter((p) => !values.some((v) => v.toLowerCase() === p.toLowerCase()))]);
    setDraft('');
  };
  return (
    <Field label={label} hint={hint} error={error}>
      {(a) => (
        <>
          {values.length > 0 && (
            <ul className={long ? 'pa-rows' : 'pa-chips'}>
              {values.map((v, i) => (
                <li key={`${v}-${i}`}>
                  <span>{v}</span>
                  <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((_, j) => j !== i))}>
                    <Icon id="close" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <span className="pa-add">
            <input
              {...a}
              type="text"
              value={draft}
              placeholder={placeholder}
              autoComplete="off"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={add}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || (e.key === ',' && !long)) {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <button type="button" className="button button-small button-ghost" onClick={add}>
              {addLabel}
            </button>
          </span>
        </>
      )}
    </Field>
  );
}

/** A titled block of the editor form. */
export function Section({ title, intro, children, id }: { title: string; intro?: string; children: ReactNode; id?: string }) {
  return (
    <section className="pa-section" id={id}>
      <h3>{title}</h3>
      {intro && <p className="pa-hint">{intro}</p>}
      {children}
    </section>
  );
}
