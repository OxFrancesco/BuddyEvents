import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-2 border-foreground placeholder:text-muted-foreground bg-background flex field-sizing-content min-h-16 w-full px-3 py-2 text-base font-medium transition-shadow outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:shadow-[4px_4px_0px_var(--ring)] focus-visible:border-ring",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
