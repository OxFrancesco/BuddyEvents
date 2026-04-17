<script lang="ts">
  let { size = 120 }: { size?: number } = $props();

  let visible = $state(false);

  $effect(() => {
    const timer = setTimeout(() => {
      visible = true;
    }, 100);

    return () => clearTimeout(timer);
  });
</script>

<img
  alt="BuddyEvents"
  class={`transition-all duration-500 ${visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
  height={size}
  src="/logo.svg"
  width={size}
/>
