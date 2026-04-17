<script lang="ts">
  import { cn } from "@/lib/utils";

  let {
    class: className = "",
    disabled = false,
    placeholder,
    type = "text",
    value = $bindable(""),
    ...restProps
  }: {
    class?: string;
    disabled?: boolean;
    placeholder?: string;
    type?: string;
    value?: string | number;
    [key: string]: unknown;
  } = $props();
</script>

<input
  bind:value
  {...restProps}
  class={cn(
    "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-2 border-foreground bg-background h-9 w-full min-w-0 px-3 py-1 text-base font-medium transition-shadow outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:shadow-[4px_4px_0px_var(--ring)] focus-visible:border-ring",
    className,
  )}
  {disabled}
  {placeholder}
  {type}
/>
