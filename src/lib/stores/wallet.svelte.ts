import { createContext, onMount } from "svelte";
import {
  connect,
  createConfig,
  disconnect,
  getAccount,
  getConnectors,
  http,
  reconnect,
  signMessage,
  watchAccount,
  watchConnectors,
} from "@wagmi/core";
import { injected, walletConnect } from "@wagmi/connectors";
import { WC_PROJECT_ID } from "$lib/client-env";
import { CHAIN_CONFIGS, getPublicRpcUrl } from "@/lib/chains";

const supportedChains = [
  CHAIN_CONFIGS.monadTestnet.viemChain,
  CHAIN_CONFIGS.baseMainnet.viemChain,
] as const;

class WalletStore {
  config = createConfig({
    chains: supportedChains,
    connectors: [injected(), walletConnect({ projectId: WC_PROJECT_ID })],
    transports: {
      10143: http(getPublicRpcUrl("monadTestnet")),
      8453: http(getPublicRpcUrl("baseMainnet")),
    },
  });

  account = $state(getAccount(this.config));
  connectors = $state(getConnectors(this.config));
  isReady = $state(false);

  constructor() {
    onMount(() => {
      const unwatchAccount = watchAccount(this.config, {
        onChange: (account) => {
          this.account = account;
        },
      });

      const unwatchConnectors = watchConnectors(this.config, {
        onChange: (connectors) => {
          this.connectors = connectors;
        },
      });

      void reconnect(this.config).catch(() => {});
      this.isReady = true;

      return () => {
        unwatchAccount();
        unwatchConnectors();
      };
    });
  }

  get address() {
    return this.account.address;
  }

  get isConnected() {
    return this.account.status === "connected" && !!this.account.address;
  }

  async connect(connector: (typeof this.connectors)[number]) {
    return connect(this.config, { connector });
  }

  async disconnect() {
    return disconnect(this.config);
  }

  async signMessage(message: string) {
    return signMessage(this.config, { message });
  }
}

const [internalGetWalletContext, setInternalGetWalletContext] =
  createContext<WalletStore>();

export function getWalletContext() {
  const walletContext = internalGetWalletContext();
  if (!walletContext) {
    throw new Error("Wallet context not found");
  }
  return walletContext;
}

export function setWalletContext() {
  const walletContext = new WalletStore();
  setInternalGetWalletContext(walletContext);
  return walletContext;
}
