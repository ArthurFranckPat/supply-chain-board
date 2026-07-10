import type { ComponentProps, ValidComponent } from "solid-js"
import { splitProps } from "solid-js"
import { AlertDialog as AlertDialogPrimitive } from "@kobalte/core/alert-dialog"

import { cx } from "@/libs/cva"

/**
 * AlertDialog shadcn-solid (issue #62, lot 0) — confirmation modale pour les
 * actions destructives (ex. « Jeter » un scénario). Contrairement à <Dialog>,
 * le primitif Kobalte n'est PAS fermé par un clic hors du panneau : l'utilisateur
 * doit choisir explicitement (confirme / annule).
 */
export const AlertDialogPortal = AlertDialogPrimitive.Portal

export type AlertDialogProps = ComponentProps<typeof AlertDialogPrimitive>

export const AlertDialog = (props: AlertDialogProps) => {
  return <AlertDialogPrimitive data-slot="alert-dialog" {...props} />
}

export type AlertDialogTriggerProps<T extends ValidComponent = "button"> =
  ComponentProps<typeof AlertDialogPrimitive.Trigger<T>>

export const AlertDialogTrigger = <T extends ValidComponent = "button">(
  props: AlertDialogTriggerProps<T>,
) => {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
}

export type AlertDialogCloseButtonProps<T extends ValidComponent = "button"> =
  ComponentProps<typeof AlertDialogPrimitive.CloseButton<T>>

export const AlertDialogCloseButton = <T extends ValidComponent = "button">(
  props: AlertDialogCloseButtonProps<T>,
) => {
  return <AlertDialogPrimitive.CloseButton data-slot="alert-dialog-close" {...props} />
}

export type AlertDialogContentProps<T extends ValidComponent = "div"> =
  ComponentProps<typeof AlertDialogPrimitive.Content<T>>

export const AlertDialogContent = <T extends ValidComponent = "div">(
  props: AlertDialogContentProps<T>,
) => {
  const [, rest] = splitProps(props as AlertDialogContentProps, ["class", "children"])

  return (
    <>
      <AlertDialogPrimitive.Overlay
        data-slot="alert-dialog-overlay"
        class="data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 fixed inset-0 z-50 bg-black/50"
      />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        class={cx(
          "bg-background data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          props.class,
        )}
        {...rest}
      >
        {props.children}
      </AlertDialogPrimitive.Content>
    </>
  )
}

export type AlertDialogHeaderProps = ComponentProps<"div">

export const AlertDialogHeader = (props: AlertDialogHeaderProps) => {
  const [, rest] = splitProps(props, ["class"])
  return (
    <div data-slot="alert-dialog-header" class={cx("flex flex-col gap-2 text-center sm:text-left", props.class)} {...rest} />
  )
}

export type AlertDialogFooterProps = ComponentProps<"div">

export const AlertDialogFooter = (props: AlertDialogFooterProps) => {
  const [, rest] = splitProps(props, ["class"])
  return (
    <div data-slot="alert-dialog-footer" class={cx("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", props.class)} {...rest} />
  )
}

export type AlertDialogTitleProps<T extends ValidComponent = "h2"> = ComponentProps<typeof AlertDialogPrimitive.Title<T>>

export const AlertDialogTitle = <T extends ValidComponent = "h2">(props: AlertDialogTitleProps<T>) => {
  const [, rest] = splitProps(props as AlertDialogTitleProps, ["class"])
  return <AlertDialogPrimitive.Title data-slot="alert-dialog-title" class={cx("text-lg leading-none font-semibold", props.class)} {...rest} />
}

export type AlertDialogDescriptionProps<T extends ValidComponent = "p"> = ComponentProps<typeof AlertDialogPrimitive.Description<T>>

export const AlertDialogDescription = <T extends ValidComponent = "p">(props: AlertDialogDescriptionProps<T>) => {
  const [, rest] = splitProps(props as AlertDialogDescriptionProps, ["class"])
  return <AlertDialogPrimitive.Description data-slot="alert-dialog-description" class={cx("text-muted-foreground text-sm", props.class)} {...rest} />
}
