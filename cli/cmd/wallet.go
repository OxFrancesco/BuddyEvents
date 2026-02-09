/// cli/cmd/wallet.go — Wallet management commands
/// setup new wallet, check balance, fund from faucet
package cmd

import (
	"crypto/ecdsa"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"

	"buddyevents/internal/config"

	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/spf13/cobra"
)

var walletCmd = &cobra.Command{
	Use:   "wallet",
	Short: "Wallet management (setup, balance, fund)",
}

// ===== wallet setup =====
var walletSetupCmd = &cobra.Command{
	Use:   "setup",
	Short: "Generate a new wallet for this agent",
	RunE: func(cmd *cobra.Command, args []string) error {
		privateKey, err := crypto.GenerateKey()
		if err != nil {
			return fmt.Errorf("failed to generate key: %w", err)
		}

		privateKeyBytes := crypto.FromECDSA(privateKey)
		publicKey := privateKey.Public().(*ecdsa.PublicKey)
		address := crypto.PubkeyToAddress(*publicKey)

		cfg.PrivateKey = hexutil.Encode(privateKeyBytes)
		cfg.WalletAddress = address.Hex()

		if err := config.Save(cfg, ""); err != nil {
			return fmt.Errorf("failed to save config: %w", err)
		}

		fmt.Printf("Wallet created!\n")
		fmt.Printf("Address:     %s\n", address.Hex())
		fmt.Printf("Private Key: %s\n", hexutil.Encode(privateKeyBytes))
		fmt.Printf("\nSaved to ~/.buddyevents/config.json\n")
		fmt.Printf("\nNext: Fund your wallet with testnet MON and USDC:\n")
		fmt.Printf("  MON:  https://faucet.monad.xyz\n")
		fmt.Printf("  USDC: https://faucet.circle.com (select Monad Testnet)\n")
		return nil
	},
}

// ===== wallet balance =====
var walletBalanceCmd = &cobra.Command{
	Use:   "balance",
	Short: "Check wallet balances (MON + USDC)",
	RunE: func(cmd *cobra.Command, args []string) error {
		addr := cfg.WalletAddress
		if addr == "" {
			return fmt.Errorf("no wallet configured. Run: buddyevents wallet setup")
		}

		fmt.Printf("Wallet: %s\n\n", addr)

		// MON balance via JSON-RPC
		monBal, err := jsonRPCCall(cfg.MonadRPC, "eth_getBalance", []interface{}{addr, "latest"})
		if err != nil {
			fmt.Printf("MON:  error: %v\n", err)
		} else {
			wei := new(big.Int)
			wei.SetString(strings.TrimPrefix(monBal, "0x"), 16)
			eth := new(big.Float).Quo(new(big.Float).SetInt(wei), new(big.Float).SetInt(big.NewInt(1e18)))
			fmt.Printf("MON:  %s\n", eth.Text('f', 6))
		}

		// USDC balance via ERC20 balanceOf call
		callData := "0x70a08231000000000000000000000000" + strings.TrimPrefix(addr, "0x")
		usdcBal, err := jsonRPCCall(cfg.MonadRPC, "eth_call",
			[]interface{}{map[string]string{"to": cfg.USDCAddress, "data": callData}, "latest"})
		if err != nil {
			fmt.Printf("USDC: error: %v\n", err)
		} else {
			units := new(big.Int)
			units.SetString(strings.TrimPrefix(usdcBal, "0x"), 16)
			usdc := new(big.Float).Quo(new(big.Float).SetInt(units), new(big.Float).SetInt(big.NewInt(1e6)))
			fmt.Printf("USDC: %s\n", usdc.Text('f', 6))
		}

		return nil
	},
}

// ===== wallet fund =====
var walletFundCmd = &cobra.Command{
	Use:   "fund",
	Short: "Request testnet MON from faucet",
	RunE: func(cmd *cobra.Command, args []string) error {
		addr := cfg.WalletAddress
		if addr == "" {
			return fmt.Errorf("no wallet configured. Run: buddyevents wallet setup")
		}

		fmt.Printf("Requesting testnet MON for %s...\n", addr)

		body := fmt.Sprintf(`{"chainId": 10143, "address": "%s"}`, addr)
		resp, err := http.Post("https://agents.devnads.com/v1/faucet",
			"application/json", strings.NewReader(body))
		if err != nil {
			return fmt.Errorf("faucet request failed: %w", err)
		}
		defer resp.Body.Close()

		respBody, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != 200 {
			return fmt.Errorf("faucet error (%d): %s", resp.StatusCode, string(respBody))
		}

		var result map[string]interface{}
		json.Unmarshal(respBody, &result)
		fmt.Printf("Funded! Tx: %v\n", result["txHash"])
		fmt.Printf("\nFor USDC, visit: https://faucet.circle.com (select Monad Testnet)\n")
		return nil
	},
}

func init() {
	walletCmd.AddCommand(walletSetupCmd)
	walletCmd.AddCommand(walletBalanceCmd)
	walletCmd.AddCommand(walletFundCmd)
}

// jsonRPCCall makes a raw JSON-RPC call and returns the result string
func jsonRPCCall(rpcURL, method string, params []interface{}) (string, error) {
	payload := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  method,
		"params":  params,
		"id":      1,
	}

	body, _ := json.Marshal(payload)
	resp, err := http.Post(rpcURL, "application/json", strings.NewReader(string(body)))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	var result struct {
		Result string `json:"result"`
		Error  *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	json.Unmarshal(respBody, &result)

	if result.Error != nil {
		return "", fmt.Errorf("RPC error: %s", result.Error.Message)
	}

	return result.Result, nil
}
