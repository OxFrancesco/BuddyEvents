// / cli/cmd/tickets.go — Ticket management commands
// / buy (on-chain via cast), sell, list tickets
package cmd

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"

	"buddyevents/internal/api"
	x402client "buddyevents/internal/x402"

	"github.com/spf13/cobra"
)

var ticketsCmd = &cobra.Command{
	Use:   "tickets",
	Short: "Manage tickets (buy, sell, list)",
}

// ===== tickets list =====
var ticketsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List tickets",
	RunE: func(cmd *cobra.Command, args []string) error {
		buyer, _ := cmd.Flags().GetString("buyer")
		eventID, _ := cmd.Flags().GetString("event-id")

		if buyer == "" {
			buyer = cfg.WalletAddress
		}

		client := api.NewClient(cfg.APIURL)

		if eventID != "" {
			tickets, err := client.ListTicketsByEvent(eventID)
			if err != nil {
				return fmt.Errorf("failed to list tickets: %w", err)
			}
			out, _ := json.MarshalIndent(tickets, "", "  ")
			fmt.Println(string(out))
			return nil
		}

		tickets, err := client.ListTicketsByBuyer(buyer)
		if err != nil {
			return fmt.Errorf("failed to list tickets: %w", err)
		}
		out, _ := json.MarshalIndent(tickets, "", "  ")
		fmt.Println(string(out))
		return nil
	},
}

// ===== tickets buy =====
// Uses Foundry's `cast` to interact with the smart contract on Monad
var ticketsBuyCmd = &cobra.Command{
	Use:   "buy",
	Short: "Buy a ticket (on-chain via USDC on Monad)",
	RunE: func(cmd *cobra.Command, args []string) error {
		onChainEventID, _ := cmd.Flags().GetString("on-chain-id")
		convexEventID, _ := cmd.Flags().GetString("event-id")

		if onChainEventID == "" && convexEventID == "" {
			return fmt.Errorf("provide --on-chain-id (direct contract call) or --event-id (x402 API purchase)")
		}

		if cfg.PrivateKey == "" {
			return fmt.Errorf("no private key configured. Run: buddyevents wallet setup")
		}

		contractAddr := cfg.ContractAddress
		rpcURL := cfg.MonadRPC

		if onChainEventID != "" {
			// Direct on-chain purchase via cast
			fmt.Println("Buying ticket on-chain via Monad...")

			// Step 1: Get event price
			priceOut, err := runCast("call", "--rpc-url", rpcURL,
				contractAddr, "getEvent(uint256)(string,uint256,uint256,uint256,address,bool)", onChainEventID)
			if err != nil {
				return fmt.Errorf("failed to get event: %w", err)
			}
			fmt.Printf("Event info: %s\n", priceOut)

			// Step 2: Approve USDC
			usdcAddr := cfg.USDCAddress
			fmt.Println("Approving USDC...")
			approveTx, err := runCast("send", "--rpc-url", rpcURL,
				"--private-key", cfg.PrivateKey,
				usdcAddr, "approve(address,uint256)", contractAddr, "1000000000") // Approve max for simplicity
			if err != nil {
				return fmt.Errorf("USDC approve failed: %w", err)
			}
			fmt.Printf("Approve tx: %s\n", approveTx)

			// Step 3: Buy ticket
			fmt.Println("Buying ticket...")
			buyTx, err := runCast("send", "--rpc-url", rpcURL,
				"--private-key", cfg.PrivateKey,
				contractAddr, "buyTicket(uint256)", onChainEventID)
			if err != nil {
				return fmt.Errorf("buy ticket failed: %w", err)
			}
			fmt.Printf("Buy tx: %s\n", buyTx)
			fmt.Println("Ticket purchased successfully on Monad!")
		}

		// If event ID provided, purchase through x402-protected API.
		if convexEventID != "" {
			if cfg.WalletAddress == "" {
				return fmt.Errorf("no wallet address configured. Run: buddyevents wallet setup")
			}

			fmt.Println("Buying ticket through x402 payment flow...")
			result, err := x402client.BuyTicket(
				cfg.APIURL,
				convexEventID,
				cfg.WalletAddress,
				"",
				cfg.PrivateKey,
			)
			if err != nil {
				return fmt.Errorf("x402 purchase failed: %w", err)
			} else {
				fmt.Printf("Ticket purchased!\n")
				fmt.Printf("Ticket ID: %s\n", result.TicketID)
				fmt.Printf("Settlement Tx: %s\n", result.TxHash)
			}
		}

		return nil
	},
}

// ===== tickets sell =====
var ticketsSellCmd = &cobra.Command{
	Use:   "sell",
	Short: "List a ticket for resale on the marketplace",
	RunE: func(cmd *cobra.Command, args []string) error {
		tokenID, _ := cmd.Flags().GetString("token-id")
		price, _ := cmd.Flags().GetString("price")

		if cfg.PrivateKey == "" {
			return fmt.Errorf("no private key configured")
		}

		fmt.Printf("Listing ticket #%s for %s USDC...\n", tokenID, price)
		tx, err := runCast("send", "--rpc-url", cfg.MonadRPC,
			"--private-key", cfg.PrivateKey,
			cfg.ContractAddress, "listTicket(uint256,uint256)", tokenID, price)
		if err != nil {
			return fmt.Errorf("list ticket failed: %w", err)
		}
		fmt.Printf("Listed! Tx: %s\n", tx)
		return nil
	},
}

func init() {
	// tickets list
	ticketsListCmd.Flags().String("buyer", "", "Filter by buyer address (defaults to config wallet)")
	ticketsListCmd.Flags().String("event-id", "", "Filter by event ID")

	// tickets buy
	ticketsBuyCmd.Flags().String("on-chain-id", "", "On-chain event ID (for direct contract call)")
	ticketsBuyCmd.Flags().String("event-id", "", "Convex event ID (for API purchase)")

	// tickets sell
	ticketsSellCmd.Flags().String("token-id", "", "NFT token ID to sell")
	ticketsSellCmd.Flags().String("price", "", "Price in USDC smallest units")
	_ = ticketsSellCmd.MarkFlagRequired("token-id")
	_ = ticketsSellCmd.MarkFlagRequired("price")

	ticketsCmd.AddCommand(ticketsListCmd)
	ticketsCmd.AddCommand(ticketsBuyCmd)
	ticketsCmd.AddCommand(ticketsSellCmd)
}

// runCast executes a `cast` command (Foundry) and returns stdout
func runCast(args ...string) (string, error) {
	cmd := exec.Command("cast", args...)
	out, err := cmd.CombinedOutput()
	result := strings.TrimSpace(string(out))
	if err != nil {
		return result, fmt.Errorf("%s: %w", result, err)
	}
	return result, nil
}
