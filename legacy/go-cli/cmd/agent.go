/// cli/cmd/agent.go — Agent registration commands
package cmd

import (
	"encoding/json"
	"fmt"

	"buddyevents/internal/api"

	"github.com/spf13/cobra"
)

var agentCmd = &cobra.Command{
	Use:   "agent",
	Short: "Agent management (register, info)",
}

// ===== agent register =====
var agentRegisterCmd = &cobra.Command{
	Use:   "register",
	Short: "Register this agent with BuddyEvents",
	RunE: func(cmd *cobra.Command, args []string) error {
		name, _ := cmd.Flags().GetString("name")
		wallet, _ := cmd.Flags().GetString("wallet")
		owner, _ := cmd.Flags().GetString("owner")

		if wallet == "" {
			wallet = cfg.WalletAddress
		}
		if wallet == "" {
			return fmt.Errorf("no wallet address. Run: buddyevents wallet setup")
		}

		client := api.NewClient(cfg.APIURL)
		agentID, err := client.RegisterAgent(name, wallet, owner)
		if err != nil {
			return fmt.Errorf("registration failed: %w", err)
		}

		fmt.Printf("Agent registered!\n")
		fmt.Printf("ID:      %s\n", agentID)
		fmt.Printf("Name:    %s\n", name)
		fmt.Printf("Wallet:  %s\n", wallet)
		return nil
	},
}

// ===== agent info =====
var agentInfoCmd = &cobra.Command{
	Use:   "info",
	Short: "Get agent info by wallet address",
	RunE: func(cmd *cobra.Command, args []string) error {
		wallet, _ := cmd.Flags().GetString("wallet")
		if wallet == "" {
			wallet = cfg.WalletAddress
		}

		client := api.NewClient(cfg.APIURL)
		agent, err := client.GetAgent(wallet)
		if err != nil {
			return fmt.Errorf("lookup failed: %w", err)
		}

		out, _ := json.MarshalIndent(agent, "", "  ")
		fmt.Println(string(out))
		return nil
	},
}

func init() {
	agentRegisterCmd.Flags().String("name", "", "Agent name (required)")
	agentRegisterCmd.Flags().String("wallet", "", "Agent wallet address (defaults to config)")
	agentRegisterCmd.Flags().String("owner", "", "Human owner address (required)")
	_ = agentRegisterCmd.MarkFlagRequired("name")
	_ = agentRegisterCmd.MarkFlagRequired("owner")

	agentInfoCmd.Flags().String("wallet", "", "Wallet address to look up")

	agentCmd.AddCommand(agentRegisterCmd)
	agentCmd.AddCommand(agentInfoCmd)
}
