<script lang="ts">
  import { onMount } from "svelte";
  import { getClerkContext } from "$lib/stores/clerk.svelte";

  const clerkContext = getClerkContext();

  let node = $state<HTMLDivElement | null>(null);

  onMount(() => {
    if (!node || !clerkContext.currentUser) return;
    return clerkContext.mountUserButton(node);
  });
</script>

<div bind:this={node}></div>
