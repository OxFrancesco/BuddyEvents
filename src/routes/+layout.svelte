<script lang="ts">
  import "./layout.css";

  let { children } = $props();
</script>

<svelte:head>
  <link href="/favicon.png" rel="icon" />
</svelte:head>

{@render children()}
