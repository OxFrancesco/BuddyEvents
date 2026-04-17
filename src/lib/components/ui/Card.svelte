<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "@/lib/utils";

  let {
    children,
    class: className = "",
  }: {
    children?: Snippet;
    class?: string;
  } = $props();
</script>

<div
  class={cn(
    "bg-card text-card-foreground flex flex-col gap-6 border-2 border-foreground py-6 shadow-[6px_6px_0px_var(--foreground)]",
    className,
  )}
>
  {@render children?.()}
</div>
