interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  /** Omit for an alert-style dialog (single OK button, in-app replacement for window.alert). */
  onCancel?: () => void;
}

/** In-app replacement for window.confirm/window.alert — styled to match the rest of the UI. */
export default function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: Props) {
  return (
    <div className="modal-overlay" onClick={onCancel ?? onConfirm}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <h2>{title}</h2>
        </div>
        <p className="muted sm">{message}</p>
        <div className="row gap" style={{ marginTop: 14, justifyContent: "flex-end" }}>
          {onCancel && (
            <button className="ghost sm" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button className="primary sm" onClick={onConfirm}>
            {confirmLabel ?? (onCancel ? "Confirm" : "OK")}
          </button>
        </div>
      </div>
    </div>
  );
}
