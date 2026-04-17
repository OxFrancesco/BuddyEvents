<script lang="ts">
  import { resolve } from "$app/paths";
  import Button from "$lib/components/ui/Button.svelte";
</script>

<header class="sticky top-0 z-50 border-b-2 border-foreground bg-background/95 backdrop-blur">
  <div class="container mx-auto flex h-16 items-center justify-between px-4">
    <a class="flex items-center gap-2" href={resolve("/")}>
      <img alt="BuddyEvents" height="36" src="/logo.svg" width="36" />
      <span class="text-xl font-black uppercase tracking-widest">BuddyEvents</span>
    </a>
    <nav class="flex items-center gap-2">
      <Button href="/events" size="sm" variant="ghost">Events</Button>
      <Button href="/create" size="sm" variant="outline">Create Event</Button>
    </nav>
  </div>
</header>
