// / cli/cmd/wallet.go — Wallet management commands
// / setup new wallet, check balance, fund from faucet
package cmd

import (
	"crypto/ecdsa"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"math/big"
	"net/http"
	"strings"

	"buddyevents/internal/config"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/core/types"
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

// ===== wallet send =====
var (
	sendTo     string
	sendAmount float64
	sendToken  string
)

var walletSendCmd = &cobra.Command{
	Use:   "send",
	Short: "Send MON or USDC from configured wallet",
	RunE: func(cmd *cobra.Command, args []string) error {
		if cfg.WalletAddress == "" || cfg.PrivateKey == "" {
			return fmt.Errorf("no wallet configured. Run: buddyevents wallet setup")
		}
		if !common.IsHexAddress(sendTo) {
			return fmt.Errorf("invalid --to address: %s", sendTo)
		}
		if sendAmount <= 0 {
			return fmt.Errorf("amount must be > 0")
		}

		privateKey, err := crypto.HexToECDSA(strings.TrimPrefix(cfg.PrivateKey, "0x"))
		if err != nil {
			return fmt.Errorf("invalid private key in config: %w", err)
		}

		chainIDHex, err := jsonRPCCall(cfg.MonadRPC, "eth_chainId", []interface{}{})
		if err != nil {
			return fmt.Errorf("failed to fetch chain id: %w", err)
		}
		chainID := hexToBigInt(chainIDHex)
		if chainID == nil {
			return fmt.Errorf("invalid chain id: %s", chainIDHex)
		}

		nonceHex, err := jsonRPCCall(cfg.MonadRPC, "eth_getTransactionCount", []interface{}{cfg.WalletAddress, "pending"})
		if err != nil {
			return fmt.Errorf("failed to fetch nonce: %w", err)
		}
		nonce := hexToBigInt(nonceHex)
		if nonce == nil {
			return fmt.Errorf("invalid nonce: %s", nonceHex)
		}

		gasPriceHex, err := jsonRPCCall(cfg.MonadRPC, "eth_gasPrice", []interface{}{})
		if err != nil {
			return fmt.Errorf("failed to fetch gas price: %w", err)
		}
		gasPrice := hexToBigInt(gasPriceHex)
		if gasPrice == nil {
			return fmt.Errorf("invalid gas price: %s", gasPriceHex)
		}

		var (
			to       common.Address
			value    = big.NewInt(0)
			data     []byte
			gasLimit uint64
		)

		switch strings.ToLower(sendToken) {
		case "mon":
			to = common.HexToAddress(sendTo)
			gasLimit = 21_000
			value = monToWei(sendAmount)
			if value == nil || value.Sign() <= 0 {
				return fmt.Errorf("invalid MON amount: %f", sendAmount)
			}
		case "usdc":
			if !common.IsHexAddress(cfg.USDCAddress) {
				return fmt.Errorf("invalid USDC contract address in config: %s", cfg.USDCAddress)
			}
			to = common.HexToAddress(cfg.USDCAddress)
			gasLimit = 100_000
			data, err = buildERC20TransferData(sendTo, sendAmount, 6)
			if err != nil {
				return err
			}
		default:
			return fmt.Errorf("unsupported token %q (use mon|usdc)", sendToken)
		}

		tx := types.NewTransaction(nonce.Uint64(), to, value, gasLimit, gasPrice, data)
		signer := types.NewEIP155Signer(chainID)
		signedTx, err := types.SignTx(tx, signer, privateKey)
		if err != nil {
			return fmt.Errorf("failed to sign transaction: %w", err)
		}

		rawTx, err := signedTx.MarshalBinary()
		if err != nil {
			return fmt.Errorf("failed to encode transaction: %w", err)
		}
		rawTxHex := "0x" + hex.EncodeToString(rawTx)

		txHash, err := jsonRPCCall(cfg.MonadRPC, "eth_sendRawTransaction", []interface{}{rawTxHex})
		if err != nil {
			return fmt.Errorf("failed to send transaction: %w", err)
		}

		fmt.Printf("Sent %f %s to %s\n", sendAmount, strings.ToUpper(sendToken), sendTo)
		fmt.Printf("Tx: %s\n", txHash)
		return nil
	},
}

func init() {
	walletCmd.AddCommand(walletSetupCmd)
	walletCmd.AddCommand(walletBalanceCmd)
	walletCmd.AddCommand(walletFundCmd)
	walletSendCmd.Flags().StringVar(&sendTo, "to", "", "recipient wallet address")
	walletSendCmd.Flags().Float64Var(&sendAmount, "amount", 0, "amount to send")
	walletSendCmd.Flags().StringVar(&sendToken, "token", "mon", "token to send: mon|usdc")
	_ = walletSendCmd.MarkFlagRequired("to")
	_ = walletSendCmd.MarkFlagRequired("amount")
	walletCmd.AddCommand(walletSendCmd)
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

func hexToBigInt(hexStr string) *big.Int {
	n := new(big.Int)
	if _, ok := n.SetString(strings.TrimPrefix(hexStr, "0x"), 16); !ok {
		return nil
	}
	return n
}

func monToWei(amount float64) *big.Int {
	if !isFinitePositive(amount) {
		return nil
	}
	weiFloat := new(big.Float).Mul(big.NewFloat(amount), big.NewFloat(1e18))
	wei := new(big.Int)
	weiFloat.Int(wei)
	return wei
}

func buildERC20TransferData(to string, amount float64, decimals int) ([]byte, error) {
	if !common.IsHexAddress(to) {
		return nil, fmt.Errorf("invalid recipient address: %s", to)
	}
	if !isFinitePositive(amount) {
		return nil, fmt.Errorf("amount must be > 0")
	}

	multiplier := new(big.Float).SetFloat64(math.Pow10(decimals))
	unitsFloat := new(big.Float).Mul(big.NewFloat(amount), multiplier)
	units := new(big.Int)
	unitsFloat.Int(units)
	if units.Sign() <= 0 {
		return nil, fmt.Errorf("amount too small for token decimals")
	}

	selector := "a9059cbb" // transfer(address,uint256)
	toNoPrefix := strings.TrimPrefix(strings.ToLower(to), "0x")
	toPadded := strings.Repeat("0", 64-len(toNoPrefix)) + toNoPrefix
	amountHex := fmt.Sprintf("%x", units)
	amountPadded := strings.Repeat("0", 64-len(amountHex)) + amountHex

	dataHex := selector + toPadded + amountPadded
	data, err := hex.DecodeString(dataHex)
	if err != nil {
		return nil, fmt.Errorf("failed to encode ERC20 transfer data: %w", err)
	}
	return data, nil
}

func isFinitePositive(v float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0) && v > 0
}
