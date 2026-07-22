'use client';

import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  eyebrow?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  titleId?: string;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  eyebrow = 'Confirmar',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  loading = false,
  titleId = 'confirm-dialog-title',
}: ConfirmDialogProps) {
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={() => {
        if (!loading) onClose();
      }}
    >
      <div
        className="my-auto max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-red-500/40 bg-[#0a0a0b] p-5 shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-mono text-xs tracking-widest text-red-500 uppercase">{eyebrow}</p>
        <h2 id={titleId} className="mt-2 text-lg font-bold text-zinc-100">
          {title}
        </h2>
        <p className="mt-2 text-sm text-zinc-400">{description}</p>

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
          >
            {loading ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}