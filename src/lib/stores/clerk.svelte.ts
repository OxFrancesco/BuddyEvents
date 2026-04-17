import { Clerk } from "@clerk/clerk-js";
import { ui } from "@clerk/ui";
import { createContext, onMount } from "svelte";
import { CLERK_PUBLISHABLE_KEY } from "$lib/client-env";

type EmittedOrganization = NonNullable<
  Parameters<Parameters<Clerk["addListener"]>[0]>[0]["organization"]
>;
type EmittedUser = NonNullable<
  Parameters<Parameters<Clerk["addListener"]>[0]>[0]["user"]
>;
type EmittedSession = NonNullable<
  Parameters<Parameters<Clerk["addListener"]>[0]>[0]["session"]
>;

class ClerkStore {
  isClerkLoaded = $state(false);
  clerk = new Clerk(CLERK_PUBLISHABLE_KEY);
  currentOrganization = $state<EmittedOrganization | null>(null);
  currentSession = $state<EmittedSession | null>(null);
  currentUser = $state<EmittedUser | null>(null);

  constructor() {
    $effect(() => {
      const cleanup = this.clerk.addListener((emission) => {
        this.currentOrganization = emission.organization ?? null;
        this.currentSession = emission.session ?? null;
        this.currentUser = emission.user ?? null;
      });

      return () => {
        cleanup();
      };
    });

    onMount(async () => {
      try {
        await this.clerk.load({
          ui,
          afterSignOutUrl: "/",
          signInForceRedirectUrl: "/events",
          signUpForceRedirectUrl: "/events",
        });
      } finally {
        this.isClerkLoaded = true;
      }
    });
  }

  openSignIn() {
    this.clerk.openSignIn();
  }

  async signOut() {
    await this.clerk.signOut({ redirectUrl: "/" });
  }

  mountUserButton(node: HTMLDivElement) {
    this.clerk.mountUserButton(node);
    return () => this.clerk.unmountUserButton(node);
  }
}

const [internalGetClerkContext, setInternalGetClerkContext] =
  createContext<ClerkStore>();

export function getClerkContext() {
  const clerkContext = internalGetClerkContext();
  if (!clerkContext) {
    throw new Error("Clerk context not found");
  }
  return clerkContext;
}

export function setClerkContext() {
  const clerkContext = new ClerkStore();
  setInternalGetClerkContext(clerkContext);
  return clerkContext;
}
