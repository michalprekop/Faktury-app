import { useEffect, useRef, type ReactNode } from 'react';
import { X, Upload, Trash2 } from 'lucide-react';
import type { Company } from '../shared/model';
import { imageFile } from './api';
import { imageSizeLabel } from '../shared/image-limits';

export function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={'field' + (wide ? ' wide' : '')}>
      <span>{label}</span>
      {children}
    </label>
  );
}
export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="error">
      {error}
    </div>
  ) : null;
}
export function Modal({
  title,
  children,
  onClose,
  className = '',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const dialog = useRef<HTMLElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const elements = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        ) ?? [],
      ).filter((e) => e.getClientRects().length);
    elements()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      }
      if (event.key === 'Tab') {
        const xs = elements(),
          first = xs[0],
          last = xs[xs.length - 1];
        if (!first) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      prior?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${className}`}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Zavrieť">
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function CompanyFields({
  value,
  onChange,
}: {
  value: Company;
  onChange: (c: Company) => void;
}) {
  const names: [keyof Company, string][] = [
    ['name', 'Názov / meno'],
    ['street', 'Ulica a číslo'],
    ['postalCode', 'PSČ'],
    ['city', 'Mesto'],
    ['country', 'Krajina'],
    ['companyID', 'IČO'],
    ['taxID', 'DIČ'],
    ['vatID', 'IČ DPH'],
    ['email', 'E-mail'],
    ['phone', 'Telefón'],
    ['website', 'Web'],
    ['registration', 'Zápis v registri'],
  ];
  return (
    <div className="form-grid">
      {names.map(([key, label]) => (
        <Field key={key} label={label} wide={key === 'name' || key === 'registration'}>
          <input
            value={String(value[key])}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          />
        </Field>
      ))}
      <label className="check wide">
        <input
          type="checkbox"
          checked={value.vatPayer}
          onChange={(e) => onChange({ ...value, vatPayer: e.target.checked })}
        />
        Platiteľ DPH
      </label>
    </div>
  );
}
export function ImageInput({
  label,
  value,
  onChange,
  onError,
  maxBytes = 130_000,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onError: (s: string) => void;
  maxBytes?: number;
}) {
  return (
    <div className="image-input">
      <span className="eyebrow">{label}</span>
      <div className="image-upload">
        {value ? <img src={value} alt={label} /> : <Upload size={24} />}
        <label className="button secondary">
          {value ? 'Vymeniť' : 'Nahrať obrázok'}
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f)
                try {
                  onChange(await imageFile(f, maxBytes));
                } catch (error) {
                  onError((error as Error).message);
                }
              e.target.value = '';
            }}
          />
        </label>
        {value && (
          <button
            className="icon-button"
            aria-label={`Odstrániť ${label.toLowerCase()}`}
            onClick={() => onChange('')}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      <small>PNG alebo JPEG · do {imageSizeLabel(maxBytes)}</small>
    </div>
  );
}
export function useUnsaved(dirty: boolean) {
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [dirty]);
}
