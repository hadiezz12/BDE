"use client";

import { createContext, use, useCallback, useState, type ReactNode } from "react";
import { ApplyDialog, type ApplyFormData } from "./ApplyDialog";

/**
 * One apply dialog per campaign page, opened from anywhere inside it (the
 * side panel, the phone bar, each role's "Candidater à ce poste"). Triggers
 * stay tiny client leaves; the fiche itself remains server-rendered.
 */
type OpenApply = (positionId?: string) => void;

const ApplyContext = createContext<OpenApply | null>(null);

export function useApply(): OpenApply {
  const open = use(ApplyContext);
  if (!open) throw new Error("useApply() must be used inside <ApplyProvider>.");
  return open;
}

interface DialogState {
  open: boolean;
  /** Increments on every opening: resets the demo notice, keeps the draft. */
  openKey: number;
  positionId?: string;
  /** Increments only when a specific role is asked for, to re-preselect it. */
  choiceKey: number;
}

export function ApplyProvider({ form, children }: { form: ApplyFormData; children: ReactNode }) {
  const [state, setState] = useState<DialogState>({ open: false, openKey: 0, choiceKey: 0 });

  const openApply = useCallback<OpenApply>((positionId) => {
    setState((s) => ({
      open: true,
      openKey: s.openKey + 1,
      positionId: positionId ?? s.positionId,
      choiceKey: positionId ? s.choiceKey + 1 : s.choiceKey,
    }));
  }, []);

  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  return (
    <ApplyContext value={openApply}>
      {children}
      <ApplyDialog
        form={form}
        open={state.open}
        onClose={close}
        openKey={state.openKey}
        positionId={state.positionId}
        choiceKey={state.choiceKey}
      />
    </ApplyContext>
  );
}
