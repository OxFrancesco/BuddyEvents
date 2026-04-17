import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadCliConfig,
  saveCliConfig,
  type StoredCliConfig,
} from "@/tools/cli/config";

describe("CLI config", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("loads legacy flat Monad config into the multichain shape", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "buddyevents-cli-"));
    const configPath = path.join(tempDir, "config.json");

    await fs.writeFile(
      configPath,
      JSON.stringify({
        apiUrl: "https://app.example.com",
        convexUrl: "https://convex.example.com",
        monadRpc: "https://legacy-monad.example.com",
        walletAddress: "0xabc",
        privateKey: "0xdef",
        contractAddress: "0x1111111111111111111111111111111111111111",
        usdcAddress: "0x2222222222222222222222222222222222222222",
      }),
      "utf8",
    );

    const loaded = await loadCliConfig(configPath);

    expect(loaded.config.apiUrl).toBe("https://app.example.com");
    expect(loaded.config.defaultChainKey).toBe("monadTestnet");
    expect(loaded.config.chains.monadTestnet.rpcUrl).toBe(
      "https://legacy-monad.example.com",
    );
    expect(loaded.config.chains.monadTestnet.contractAddress).toBe(
      "0x1111111111111111111111111111111111111111",
    );
    expect(loaded.config.chains.monadTestnet.usdcAddress).toBe(
      "0x2222222222222222222222222222222222222222",
    );
    expect(loaded.config.chains.baseMainnet.rpcUrl).toMatch(/^https?:\/\//);
  });

  it("round-trips the new chain-aware config format", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "buddyevents-cli-"));
    const configPath = path.join(tempDir, "config.json");

    const config: StoredCliConfig = {
      apiUrl: "https://app.example.com",
      convexUrl: "https://convex.example.com",
      walletAddress: "0xabc",
      privateKey: "0xdef",
      defaultChainKey: "baseMainnet",
      chains: {
        monadTestnet: {
          rpcUrl: "https://monad.example.com",
          contractAddress: "0x1111111111111111111111111111111111111111",
          usdcAddress: "0x2222222222222222222222222222222222222222",
        },
        baseMainnet: {
          rpcUrl: "https://base.example.com",
          contractAddress: "0x3333333333333333333333333333333333333333",
          usdcAddress: "0x4444444444444444444444444444444444444444",
        },
      },
    };

    await saveCliConfig(config, configPath);
    const loaded = await loadCliConfig(configPath);

    expect(loaded.config).toEqual(config);
  });
});
