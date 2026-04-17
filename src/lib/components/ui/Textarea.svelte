<script lang="ts">
  import { cn } from "@/lib/utils";

  let {
    class: className = "",
    disabled = false,
    placeholder,
    rows = 4,
    value = $bindable(""),
    ...restProps
  }: {
    class?: string;
    disabled?: boolean;
    placeholder?: string;
    rows?: number;
    value?: string;
    [key: string]: unknown;
  } = $props();
</script>

<textarea
  bind:value
  {...restProps}
  class={cn(
    "border-2 border-foreground placeholder:text-muted-foreground bg-background flex min-h-16 w-full px-3 py-2 text-base font-medium transition-shadow outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:shadow-[4px_4px_0px_var(--ring)] focus-visible:border-ring",
    className,
  )}
  {disabled}
  {placeholder}
  {rows}
></textarea>
