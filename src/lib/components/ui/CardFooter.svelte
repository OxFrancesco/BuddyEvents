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

<div class={cn("flex items-center px-6", className)}>
  {@render children?.()}
</div>
