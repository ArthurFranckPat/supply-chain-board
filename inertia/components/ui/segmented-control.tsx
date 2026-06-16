import type { ComponentProps, ValidComponent } from "solid-js"
import { splitProps } from "solid-js"
import { SegmentedControl as SegmentedControlPrimitive } from "@kobalte/core/segmented-control"

import { cx } from "@/libs/cva"

export type SegmentedControlProps<T extends ValidComponent = "div"> =
  ComponentProps<typeof SegmentedControlPrimitive<T>>

export const SegmentedControl = <T extends ValidComponent = "div">(
  props: SegmentedControlProps<T>,
) => {
  const [, rest] = splitProps(props as SegmentedControlProps, ["class"])

  return (
    <SegmentedControlPrimitive
      data-slot="segmented-control"
      class={cx("group/segmented-control flex flex-col gap-2", props.class)}
      {...rest}
    />
  )
}

export type SegmentedControlItemInputProps<T extends ValidComponent = "input"> =
  ComponentProps<typeof SegmentedControlPrimitive.ItemInput<T>>

export const SegmentedControlItemInput = <T extends ValidComponent = "input">(
  props: SegmentedControlItemInputProps<T>,
) => {
  return (
    <SegmentedControlPrimitive.ItemInput
      data-slot="segmented-control-item-input"
      {...props}
    />
  )
}

export type SegmentedControlItemLabelProps<T extends ValidComponent = "label"> =
  ComponentProps<typeof SegmentedControlPrimitive.ItemLabel<T>>

export const SegmentedControlItemLabel = <T extends ValidComponent = "label">(
  props: SegmentedControlItemLabelProps<T>,
) => {
  const [, rest] = splitProps(props as SegmentedControlItemLabelProps, ["class"])

  return (
    <SegmentedControlPrimitive.ItemLabel
      data-slot="segmented-control-item-label"
      class={cx(
        "text-foreground relative flex flex-nowrap place-content-center px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,opacity] select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        props.class,
      )}
      {...rest}
    />
  )
}

export type SegmentedControlIndicatorProps<T extends ValidComponent = "div"> =
  ComponentProps<typeof SegmentedControlPrimitive.Indicator<T>>

export const SegmentedControlIndicator = <T extends ValidComponent = "div">(
  props: SegmentedControlIndicatorProps<T>,
) => {
  const [, rest] = splitProps(props as SegmentedControlIndicatorProps, ["class"])

  return (
    <SegmentedControlPrimitive.Indicator
      data-slot="segmented-control-indicator"
      class={cx(
        "bg-background absolute top-[3px] left-[3px] rounded-md border border-transparent shadow-sm transition-[width,height,transform]",
        props.class,
      )}
      {...rest}
    />
  )
}

export type SegmentedControlItemProps<T extends ValidComponent = "div"> =
  ComponentProps<typeof SegmentedControlPrimitive.Item<T>>

export const SegmentedControlItem = <T extends ValidComponent = "div">(
  props: SegmentedControlItemProps<T>,
) => {
  const [, rest] = splitProps(props as SegmentedControlItemProps, ["class"])

  return (
    <SegmentedControlPrimitive.Item
      data-slot="segmented-control-item"
      class={cx("relative", props.class)}
      {...rest}
    />
  )
}

export type SegmentedControlListProps = ComponentProps<"div">

export const SegmentedControlList = (props: SegmentedControlListProps) => {
  const [, rest] = splitProps(props, ["class"])

  return (
    <div
      data-slot="segmented-control-list"
      role="presentation"
      class={cx(
        "bg-muted text-muted-foreground relative h-full w-fit rounded-lg",
        props.class,
      )}
      {...rest}
    />
  )
}

export type SegmentedControlItemsProps = ComponentProps<"div">

export const SegmentedControlItems = (props: SegmentedControlItemsProps) => {
  const [, rest] = splitProps(props, ["class"])

  return (
    <div
      data-slot="segmented-control-items"
      role="presentation"
      class={cx(
        "inline-flex list-none p-[3px] group-[[aria-orientation=vertical]]/segmented-control:flex-col",
        props.class,
      )}
      {...rest}
    />
  )
}
