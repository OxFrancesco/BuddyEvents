<script lang="ts">
  let {
    size = 180,
    value,
  }: {
    size?: number;
    value: string;
  } = $props();

  let dataUrl = $state<string | null>(null);
  let hasError = $state(false);

  $effect(() => {
    let cancelled = false;

    void import("qrcode")
      .then(({ toDataURL }) =>
        toDataURL(value, {
          width: size,
          margin: 1,
          errorCorrectionLevel: "M",
        }),
      )
      .then((url: string) => {
        if (cancelled) return;
        hasError = false;
        dataUrl = url;
      })
      .catch(() => {
        if (cancelled) return;
        hasError = true;
        dataUrl = null;
      });

    return () => {
      cancelled = true;
    };
  });
</script>

{#if hasError}
  <div class="h-[180px] w-[180px] border-2 border-dashed border-foreground p-3 text-center text-xs text-muted-foreground">
    QR generation failed
  </div>
{:else if !dataUrl}
  <div class="h-[180px] w-[180px] animate-pulse border-2 border-foreground bg-muted"></div>
{:else}
  <img
    alt="Ticket QR code"
    class="border-2 border-foreground bg-foreground p-2"
    height={size}
    loading="lazy"
    src={dataUrl}
    width={size}
  />
{/if}
