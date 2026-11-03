import { useEffect, useId, useRef, useState } from "react";
import { useT } from "@/i18n";
import type { FolderInfo } from "@/types";

export function FolderRemoveDialog({ folder, onConfirm, onClose }: {
  folder: FolderInfo;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current!;
    // A modal dialog makes the rest of the app inert and contains keyboard focus.
    dialog.showModal();
    cancelRef.current?.focus();
    return () => dialog.close();
  }, []);

  const confirm = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setFailed(false);
    try {
      await onConfirm();
      onClose();
    } catch {
      submitting.current = false;
      setPending(false);
      setFailed(true);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="folder-remove-dialog no-drag"
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={pending}
      onCancel={(e) => {
        e.preventDefault();
        if (!submitting.current) onClose();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="folder-remove-body">
        <div className="folder-remove-heading">
          <span className="folder-remove-warning" aria-hidden="true"><i className="ph ph-warning" /></span>
          <button className="btn btn-ghost btn-icon folder-remove-close" aria-label={t("common.close")} disabled={pending} onClick={onClose}>
            <i className="ph ph-x" aria-hidden="true" />
          </button>
        </div>
        <h2 id={titleId}>{t("folders.removeTitle")}</h2>
        <p className="folder-remove-description">{t("folders.removeDescription")}</p>
        <div className="folder-remove-target">
          <i className="ph ph-folder" aria-hidden="true" />
          <div className="folder-remove-details">
            <div className="folder-remove-name"><strong>{folder.name}</strong><span>{t("unit.images", folder.count)}</span></div>
            <div className="folder-remove-path" title={folder.path}>{folder.path}</div>
          </div>
        </div>
        {folder.kind === "custom" ? (
          <p id={descriptionId} className="folder-remove-reassurance folder-remove-danger">
            <i className="ph ph-warning-circle" aria-hidden="true" />
            <span>{t("folders.removeCustomFilesDeleted")}</span>
          </p>
        ) : (
          <p id={descriptionId} className="folder-remove-reassurance">
            <i className="ph ph-shield-check" aria-hidden="true" />
            <span>{t("folders.removeFilesKept")}</span>
          </p>
        )}
        {failed && <p className="folder-remove-error" role="alert">{t("folders.removeFailed")}</p>}
      </div>
      <div className="folder-remove-footer">
        <button ref={cancelRef} className="btn folder-remove-cancel" disabled={pending} onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn folder-remove-confirm" disabled={pending} onClick={confirm}>
          <i className={`ph ${pending ? "ph-hourglass" : "ph-trash"}`} aria-hidden="true" />
          {t(pending ? "folders.removing" : "folders.removeConfirm")}
        </button>
      </div>
    </dialog>
  );
}
