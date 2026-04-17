<script lang="ts">
  import Header from "$lib/components/Header.svelte";
  import UserWalletSync from "$lib/components/UserWalletSync.svelte";
  import { setWalletContext } from "$lib/stores/wallet.svelte";
  import ClerkWrapper from "$lib/wrappers/ClerkWrapper.svelte";
  import ConvexWrapper from "$lib/wrappers/ConvexWrapper.svelte";

  let { children } = $props();

  setWalletContext();
</script>

<ClerkWrapper>
  <ConvexWrapper>
    <UserWalletSync />
    <div class="min-h-screen bg-background">
      <Header />
      {@render children()}
    </div>
  </ConvexWrapper>
</ClerkWrapper>
