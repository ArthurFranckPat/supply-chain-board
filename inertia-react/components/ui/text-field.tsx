import * as React from "react"

import { cn } from "@r/lib/utils"
import { Input } from "@r/components/ui/input"
import { Label } from "@r/components/ui/label"

interface TextFieldProps {
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
  className?: string
}

function TextField({ value, onChange, children, className }: TextFieldProps) {
  // Clone children to inject value and onChange
  const clonedChildren = React.Children.map(children, (child) => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child, {
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
      } as any)
    }
    return child
  })

  return (
    <div data-slot="text-field" className={cn("grid w-full gap-2", className)}>
      {clonedChildren}
    </div>
  )
}

interface TextFieldInputProps extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange'> {
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
}

function TextFieldInput({ value = "", onChange, className, ...props }: TextFieldInputProps) {
  return (
    <Input
      value={value}
      onChange={onChange}
      className={cn("h-11", className)}
      {...props}
    />
  )
}

function TextFieldLabel({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <Label
      data-slot="text-field-label"
      className={className}
      {...props}
    />
  )
}

export { TextField, TextFieldInput, TextFieldLabel }
