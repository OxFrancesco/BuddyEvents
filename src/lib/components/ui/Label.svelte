<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "@/lib/utils";

  let {
    children,
    class: className = "",
    for: forId,
    ...restProps
  }: {
    children?: Snippet;
    class?: string;
    for?: string;
    [key: string]: unknown;
  } = $props();
</script>

<label
  {...restProps}
  class={cn("flex items-center gap-2 text-sm font-medium", className)}
  for={forId}
>
  {@render children?.()}
</label>
