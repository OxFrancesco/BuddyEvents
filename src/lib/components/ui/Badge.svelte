<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "@/lib/utils";
  import { badgeVariants, type BadgeVariant } from "./badge";

  let {
    children,
    class: className = "",
    variant = "default",
  }: {
    children?: Snippet;
    class?: string;
    variant?: BadgeVariant;
  } = $props();
</script>

<span class={cn(badgeVariants({ variant }), className)}>
  {@render children?.()}
</span>
