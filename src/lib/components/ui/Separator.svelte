<script lang="ts">
  import { cn } from "@/lib/utils";

  let {
    class: className = "",
    orientation = "horizontal",
  }: {
    class?: string;
    orientation?: "horizontal" | "vertical";
  } = $props();
</script>

<div
  class={cn(
    orientation === "horizontal"
      ? "h-[2px] w-full bg-foreground/30"
      : "h-full w-[2px] shrink-0 bg-foreground/30",
    className,
  )}
></div>
