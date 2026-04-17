<script lang="ts">
  import { useQuery, useConvexClient } from "convex-svelte";
  import { api } from "@/convex/_generated/api";
  import { getClerkWeb3WalletAddress } from "@/lib/clerkWeb3";
  import { provisionHumanWallet } from "@/lib/crossmint/client";
  import { sameAddress } from "@/lib/walletOwnership";
  import { ENABLE_CROSSMINT_HUMAN_WALLET } from "$lib/client-env";
  import { getClerkContext } from "$lib/stores/clerk.svelte";
  import { getWalletContext } from "$lib/stores/wallet.svelte";

  const clerkContext = getClerkContext();
  const walletContext = getWalletContext();
  const convex = useConvexClient();

  const meQuery = useQuery(api.users.me, () =>
    clerkContext.currentSession ? {} : "skip",
  );
  const humanWalletQuery = useQuery(api.wallets.getByUserAndPurpose, () =>
    meQuery.data
      ? { userId: meQuery.data._id, purpose: "human_primary" as const }
      : "skip",
  );

  const isSignedIn = $derived(Boolean(clerkContext.currentSession && clerkContext.currentUser));

  let lastProfileSync = $state<string | null>(null);
  let lastWalletSync = $state<string | null>(null);
  let lastProvision = $state<string | null>(null);

  $effect(() => {
    if (!clerkContext.isClerkLoaded) return;

    if (!isSignedIn) {
      lastProfileSync = null;
      lastWalletSync = null;
      lastProvision = null;
      return;
    }

    const profileKey = clerkContext.currentUser?.id ?? "signed-in";
    if (lastProfileSync === profileKey) return;

    lastProfileSync = profileKey;
    void convex.mutation(api.users.upsertMe, {});
  });

  $effect(() => {
    if (!clerkContext.isClerkLoaded || !isSignedIn || !meQuery.data) return;

    const externalWalletKey = walletContext.address?.toLowerCase() ?? "none";
    if (lastWalletSync === externalWalletKey) return;

    lastWalletSync = externalWalletKey;
    void convex.mutation(api.users.setExternalWalletAddress, {
      walletAddress: walletContext.address ?? undefined,
    });
  });

  $effect(() => {
    if (!ENABLE_CROSSMINT_HUMAN_WALLET) return;
    if (
      !clerkContext.isClerkLoaded ||
      !isSignedIn ||
      !meQuery.data ||
      !walletContext.isConnected ||
      !walletContext.address ||
      humanWalletQuery.data
    ) {
      return;
    }

    const primaryEmail = clerkContext.currentUser?.primaryEmailAddress?.emailAddress;
    if (!primaryEmail) return;

    const clerkWalletAddress = getClerkWeb3WalletAddress(clerkContext.currentUser);
    if (clerkWalletAddress && !sameAddress(clerkWalletAddress, walletContext.address)) {
      return;
    }

    const provisionKey = `${meQuery.data._id}:${walletContext.address.toLowerCase()}`;
    if (lastProvision === provisionKey) return;

    lastProvision = provisionKey;
    void provisionHumanWallet({ signerAddress: walletContext.address }).catch(() => {
      lastProvision = null;
    });
  });
</script>
