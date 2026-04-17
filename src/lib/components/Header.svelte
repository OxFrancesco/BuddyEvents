<script lang="ts">
  import { resolve } from "$app/paths";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import ConnectWallet from "$lib/components/ConnectWallet.svelte";
  import MonadFaucetButton from "$lib/components/MonadFaucetButton.svelte";
</script>

<header class="sticky top-0 z-50 border-b-2 border-foreground bg-background">
  <div class="container mx-auto flex h-16 items-center justify-between px-4">
    <a class="flex items-center gap-2" href={resolve("/")}>
      <img alt="BuddyEvents" height="36" src="/logo.svg" width="36" />
      <span class="text-xl font-black uppercase tracking-widest">BuddyEvents</span>
      <div class="hidden items-center gap-1 sm:flex">
        <Badge class="text-[10px]" variant="outline">Monad Testnet</Badge>
        <Badge class="text-[10px]" variant="outline">Base Mainnet</Badge>
      </div>
    </a>
    <nav class="flex items-center gap-2">
      <Button href="/events" size="sm" variant="ghost">Events</Button>
      <Button href="/tickets" size="sm" variant="ghost">My Tickets</Button>
      <Button href="/create" size="sm" variant="ghost">Create</Button>
      <Button href="/check-in" size="sm" variant="ghost">Check-in</Button>
      <MonadFaucetButton />
      <ConnectWallet />
    </nav>
  </div>
</header>
