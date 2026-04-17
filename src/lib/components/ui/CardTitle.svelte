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

<div class={cn("leading-none font-bold uppercase tracking-wide", className)}>
  {@render children?.()}
</div>
