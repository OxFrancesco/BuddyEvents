<script lang="ts">
  import { setClerkContext } from "$lib/stores/clerk.svelte";

  const { children } = $props();

  const clerkContext = setClerkContext();
</script>

{#if clerkContext.isClerkLoaded}
  {@render children()}
{:else}
  <div class="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
    Loading...
  </div>
{/if}
