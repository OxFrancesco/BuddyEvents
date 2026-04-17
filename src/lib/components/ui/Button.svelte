<script lang="ts">
  /* eslint-disable svelte/no-navigation-without-resolve */
  import type { Snippet } from "svelte";
  import { cn } from "@/lib/utils";
  import { buttonVariants, type ButtonSize, type ButtonVariant } from "./button";

  let {
    children,
    class: className = "",
    disabled = false,
    href,
    size = "default",
    target,
    type = "button",
    variant = "default",
    ...restProps
  }: {
    children?: Snippet;
    class?: string;
    disabled?: boolean;
    href?: string;
    size?: ButtonSize;
    target?: string;
    type?: "button" | "submit" | "reset";
    variant?: ButtonVariant;
    [key: string]: unknown;
  } = $props();

</script>

{#if href}
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
  <a
    {...restProps}
    class={cn(buttonVariants({ variant, size }), className)}
    aria-disabled={disabled}
    href={href}
    rel={target === "_blank" ? "noreferrer" : undefined}
    {target}
  >
    {@render children?.()}
  </a>
{:else}
  <button
    {...restProps}
    class={cn(buttonVariants({ variant, size }), className)}
    {disabled}
    {type}
  >
    {@render children?.()}
  </button>
{/if}
