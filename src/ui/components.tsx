import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { X, Plus, Minus } from 'lucide-react';
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={close}>
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" onClick={close} aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Counter({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (delta: number) => void;
}) {
  return (
    <div className="counter">
      <button
        disabled={disabled || value === 0}
        aria-label={`Remove 1 ${label}`}
        onClick={() => onChange(-1)}
      >
        <Minus size={14} />
      </button>
      <strong>{value.toLocaleString()}</strong>
      <button disabled={disabled} aria-label={`Add 1 ${label}`} onClick={() => onChange(1)}>
        <Plus size={14} />
      </button>
    </div>
  );
}
export function TextEditor({
  label,
  value,
  disabled,
  onSave,
  multiline = false,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onSave: (value: string) => void;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const dirty = useRef(false);
  const baseline = useRef(value);
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    if (!dirty.current) {
      setDraft(value);
      baseline.current = value;
    } else if (value !== baseline.current) setConflict(true);
  }, [value]);
  const save = () => {
    if (dirty.current && value !== baseline.current) {
      setConflict(true);
      return;
    }
    if (dirty.current && draft !== value) {
      dirty.current = false;
      baseline.current = draft;
      onSave(draft);
    } else dirty.current = false;
  };
  const change = (text: string) => {
    if (!dirty.current) baseline.current = value;
    dirty.current = true;
    setDraft(text);
  };
  return (
    <div>
      <label>
        {label}
        {multiline ? (
          <textarea
            value={draft}
            disabled={disabled}
            onChange={(e) => change(e.target.value)}
            onBlur={save}
          />
        ) : (
          <input
            value={draft}
            disabled={disabled}
            onChange={(e) => change(e.target.value)}
            onBlur={save}
          />
        )}
      </label>
      {conflict && (
        <div className="notice">
          <span>This field changed while you were typing. Your draft is preserved.</span>
          <button
            onClick={() => {
              dirty.current = false;
              baseline.current = value;
              setDraft(value);
              setConflict(false);
            }}
          >
            Use latest
          </button>
          <button
            disabled={disabled}
            onClick={() => {
              dirty.current = false;
              baseline.current = draft;
              setConflict(false);
              onSave(draft);
            }}
          >
            Save my draft instead
          </button>
        </div>
      )}
    </div>
  );
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
