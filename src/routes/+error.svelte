<!-- eslint-disable svelte/valid-prop-names-in-kit-pages -->
<script lang="ts">
  /* eslint-disable svelte/valid-prop-names-in-kit-pages */
  let { error, status } = $props<{
    error: App.Error;
    status: number;
  }>();
</script>

<div class="flex min-h-screen items-center justify-center bg-background px-4">
  <div class="w-full max-w-xl border-2 border-destructive bg-card p-8 shadow-[8px_8px_0px_var(--destructive)]">
    <p class="text-xs font-mono uppercase tracking-[0.3em] text-destructive">Application Error</p>
    <h1 class="mt-3 text-3xl font-black uppercase tracking-tight">{error.message}</h1>
    <div class="mt-4 space-y-1 font-mono text-xs text-muted-foreground">
      <p>Status: {status}</p>
      <p>Kind: {error.kind}</p>
      <p>Timestamp: {error.timestamp}</p>
      {#if error.traceId}
        <p>Trace: {error.traceId}</p>
      {/if}
    </div>
    <button
      class="mt-6 border-2 border-foreground bg-primary px-4 py-2 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-[4px_4px_0px_var(--foreground)]"
      onclick={() => window.location.reload()}
      type="button"
    >
      Retry
    </button>
  </div>
</div>
