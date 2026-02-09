/// lib/circle.ts — Circle Wallet SDK integration
/// Developer-controlled wallets for platform + agent wallet creation

const CIRCLE_API_BASE = "https://api.circle.com/v1/w3s";

interface CircleWalletConfig {
  apiKey: string;
  entitySecretCiphertext: string;
}

// Create a wallet set (one-time setup for the platform)
export async function createWalletSet(
  config: CircleWalletConfig,
  name: string,
) {
  const response = await fetch(`${CIRCLE_API_BASE}/developer/walletSets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      name,
      entitySecretCiphertext: config.entitySecretCiphertext,
    }),
  });

  if (!response.ok) throw new Error(`Circle API error: ${response.status}`);
  const data = await response.json();
  return data.data.walletSet;
}

// Create developer-controlled wallets on Monad (via EVM)
export async function createWallets(
  config: CircleWalletConfig,
  walletSetId: string,
  count: number = 1,
  blockchain: string = "MONAD-TESTNET",
) {
  const response = await fetch(`${CIRCLE_API_BASE}/developer/wallets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      accountType: "SCA",
      blockchains: [blockchain],
      count,
      entitySecretCiphertext: config.entitySecretCiphertext,
      walletSetId,
    }),
  });

  if (!response.ok) throw new Error(`Circle API error: ${response.status}`);
  const data = await response.json();
  return data.data.wallets;
}

// Get wallet balance
export async function getWalletBalance(apiKey: string, walletId: string) {
  const response = await fetch(
    `${CIRCLE_API_BASE}/wallets/${walletId}/balances`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  );

  if (!response.ok) throw new Error(`Circle API error: ${response.status}`);
  const data = await response.json();
  return data.data.tokenBalances;
}

// Transfer tokens between wallets
export async function transferTokens(
  config: CircleWalletConfig,
  walletId: string,
  destinationAddress: string,
  tokenAddress: string,
  amount: string,
) {
  const response = await fetch(
    `${CIRCLE_API_BASE}/developer/wallets/${walletId}/tokenTransfers`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        entitySecretCiphertext: config.entitySecretCiphertext,
        amounts: [amount],
        destinationAddress,
        tokenAddress,
        blockchain: "MONAD-TESTNET",
      }),
    },
  );

  if (!response.ok) throw new Error(`Circle API error: ${response.status}`);
  const data = await response.json();
  return data.data;
}
