/**
 * Confirm dialog — yes/no modal for destructive or reload actions.
 */

import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { useDialog, type DialogContext } from "./dialog.tsx"
import { useTheme } from "../context/theme.tsx"
import { Button } from "./button.tsx"
import { ModalPanel } from "./modal-panel.tsx"

export interface DialogConfirmProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel?: () => void
}

export function DialogConfirm(props: DialogConfirmProps) {
  const dialog = useDialog()
  const t = useTheme()

  function confirm() {
    props.onConfirm()
    dialog.pop()
  }

  function cancel() {
    props.onCancel?.()
    dialog.pop()
  }

  useKeyboard((evt) => {
    if (evt.name === "return" || evt.name === "enter") {
      evt.preventDefault()
      confirm()
      return
    }
    if (evt.name === "escape") {
      evt.preventDefault()
      cancel()
    }
  })

  return (
    <ModalPanel title={props.title} stackDepth={dialog.stack().length} width={56}>
      <text fg={t.color.textSecondary} wrapMode="word" content={props.message} />
      <box flexDirection="row" justifyContent="flex-end" gap={2} paddingTop={1}>
        <Button label={props.cancelLabel ?? "Cancel"} onClick={cancel} primary={false} />
        <Button label={props.confirmLabel ?? "Confirm"} onClick={confirm} primary={true} />
      </box>
      <text fg={t.color.textMuted} attributes={TextAttributes.DIM} wrapMode="none" content="enter confirm · esc cancel" />
    </ModalPanel>
  )
}

DialogConfirm.show = (
  dialog: DialogContext,
  title: string,
  message: string,
  options?: { confirmLabel?: string; cancelLabel?: string },
): Promise<boolean> => {
  return new Promise<boolean>((resolve) => {
    dialog.push(() => (
      <DialogConfirm
        title={title}
        message={message}
        confirmLabel={options?.confirmLabel}
        cancelLabel={options?.cancelLabel}
        onConfirm={() => resolve(true)}
        onCancel={() => resolve(false)}
      />
    ))
  })
}
