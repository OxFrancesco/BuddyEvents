<script lang="ts">
  import { Check, Copy } from "lucide-svelte";
  import { useQuery } from "convex-svelte";
  import { api } from "@/convex/_generated/api";
  import { getClerkWeb3WalletAddress } from "@/lib/clerkWeb3";
  import { provisionHumanWallet } from "@/lib/crossmint/client";
  import { sameAddress } from "@/lib/walletOwnership";
  import { getClerkContext } from "$lib/stores/clerk.svelte";
  import { getWalletContext } from "$lib/stores/wallet.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import ClerkUserButton from "$lib/components/ClerkUserButton.svelte";

  const clerkContext = getClerkContext();
  const walletContext = getWalletContext();

  const meQuery = useQuery(api.users.me, () =>
    clerkContext.currentSession ? {} : "skip",
  );
  const humanWalletQuery = useQuery(api.wallets.getByUserAndPurpose, () =>
    meQuery.data
      ? { userId: meQuery.data._id, purpose: "human_primary" as const }
      : "skip",
  );

  const isSignedIn = $derived(Boolean(clerkContext.currentSession && clerkContext.currentUser));
  const clerkWalletAddress = $derived(getClerkWeb3WalletAddress(clerkContext.currentUser));
  const humanWallet = $derived(humanWalletQuery.data);
  const hasWalletMismatch = $derived(
    Boolean(
      walletContext.address &&
        clerkWalletAddress &&
        !sameAddress(walletContext.address, clerkWalletAddress),
    ),
  );
  const hasEmail = $derived(
    Boolean(clerkContext.currentUser?.primaryEmailAddress?.emailAddress),
  );

  let copied = $state<string | null>(null);
  let message = $state<string | null>(null);
  let provisioning = $state(false);

  function formatAddress(address: string) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  async function handleCopy(address: string) {
    await navigator.clipboard.writeText(address);
    copied = address;
    setTimeout(() => {
      copied = null;
    }, 1500);
  }

  async function handleProvision(forceRelink = false) {
    if (!walletContext.address) {
      return;
    }

    provisioning = true;
    message = null;

    try {
      await provisionHumanWallet({
        signerAddress: walletContext.address,
        forceRelink,
      });
    } catch (error) {
      message =
        error instanceof Error ? error.message : "Smart wallet provisioning failed";
    } finally {
      provisioning = false;
    }
  }
</script>

{#snippet walletBadge(address: string, label: string, showUserButton = false)}
  <div class="group flex items-center gap-2 border-2 border-foreground bg-muted px-2 py-1 text-xs font-mono font-bold shadow-[2px_2px_0px_var(--foreground)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none">
    {#if showUserButton}
      <ClerkUserButton />
    {/if}
    <button class="flex items-center gap-2" onclick={() => void handleCopy(address)} type="button">
      <span class="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span>{formatAddress(address)}</span>
      {#if copied === address}
        <Check class="size-3 text-green-600" />
      {:else}
        <Copy class="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
      {/if}
    </button>
  </div>
{/snippet}

{#if !walletContext.isReady || !clerkContext.isClerkLoaded}
  <Button disabled size="sm" variant="outline">Loading...</Button>
{:else if !isSignedIn}
  <Button onclick={() => clerkContext.openSignIn()} size="sm" variant="outline">
    Sign In
  </Button>
{:else if humanWallet}
  <div class="flex items-center gap-2">
    {@render walletBadge(humanWallet.walletAddress, "Smart", true)}
    {#if humanWallet.linkedSignerAddress ?? walletContext.address}
      {@render walletBadge(humanWallet.linkedSignerAddress ?? walletContext.address!, "Signer")}
    {/if}
    {#if walletContext.address &&
      humanWallet.linkedSignerAddress &&
      !sameAddress(walletContext.address, humanWallet.linkedSignerAddress)}
      <Button
        disabled={provisioning || !walletContext.address}
        onclick={() => {
          if (
            window.confirm(
              "Relink this Crossmint wallet to the currently connected signer?",
            )
          ) {
            void handleProvision(true);
          }
        }}
        size="sm"
        variant="outline"
      >
        {provisioning ? "Relinking..." : "Relink"}
      </Button>
    {/if}
    {#if message}
      <span class="max-w-52 text-[10px] font-mono text-destructive">{message}</span>
    {/if}
  </div>
{:else if !walletContext.isConnected || !walletContext.address}
  <div class="flex gap-2">
    {#each walletContext.connectors as connector (connector.id)}
      <Button
        onclick={() => void walletContext.connect(connector)}
        size="sm"
        variant="outline"
      >
        {connector.name || "Connect Wallet"}
      </Button>
    {/each}
  </div>
{:else if hasWalletMismatch}
  <div class="flex items-center gap-2">
    <Button onclick={() => void walletContext.disconnect()} size="sm" variant="outline">
      Wallet Mismatch
    </Button>
    <span class="max-w-52 text-[10px] font-mono text-destructive">
      Connect the same wallet used in Clerk before provisioning Crossmint.
    </span>
  </div>
{:else if !hasEmail}
  <div class="flex items-center gap-2">
    {@render walletBadge(walletContext.address, "Signer", true)}
    <span class="max-w-48 text-[10px] font-mono text-muted-foreground">
      Add a primary email in Clerk to finish smart-wallet setup.
    </span>
  </div>
{:else}
  <div class="flex items-center gap-2">
    {@render walletBadge(walletContext.address, "Signer", true)}
    <Button
      disabled={provisioning}
      onclick={() => void handleProvision()}
      size="sm"
      variant="outline"
    >
      {provisioning ? "Provisioning..." : "Create Smart Wallet"}
    </Button>
    {#if message}
      <span class="max-w-52 text-[10px] font-mono text-destructive">{message}</span>
    {/if}
  </div>
{/if}
