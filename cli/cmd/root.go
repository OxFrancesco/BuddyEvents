/// cli/cmd/root.go — Root CLI command and global config
package cmd

import (
	"fmt"
	"os"

	"buddyevents/internal/config"

	"github.com/spf13/cobra"
)

var cfg *config.Config

var rootCmd = &cobra.Command{
	Use:   "buddyevents",
	Short: "BuddyEvents — Agent-native event ticketing on Monad",
	Long: `BuddyEvents CLI allows AI agents (and humans) to create, discover,
and purchase event tickets using USDC on Monad blockchain.

Designed to be called by Pi agent via its Bash tool.`,
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	cobra.OnInitialize(initConfig)

	rootCmd.PersistentFlags().String("config", "", "config file (default: ~/.buddyevents/config.json)")
	rootCmd.PersistentFlags().String("api-url", "", "API base URL (overrides config)")
	rootCmd.PersistentFlags().String("convex-url", "", "Convex deployment URL (overrides config)")

	rootCmd.AddCommand(eventsCmd)
	rootCmd.AddCommand(ticketsCmd)
	rootCmd.AddCommand(walletCmd)
	rootCmd.AddCommand(agentCmd)
}

func initConfig() {
	configPath, _ := rootCmd.Flags().GetString("config")
	var err error
	cfg, err = config.Load(configPath)
	if err != nil {
		// Use defaults if no config exists yet
		cfg = config.Default()
	}

	// CLI flag overrides
	if apiURL, _ := rootCmd.Flags().GetString("api-url"); apiURL != "" {
		cfg.APIURL = apiURL
	}
	if convexURL, _ := rootCmd.Flags().GetString("convex-url"); convexURL != "" {
		cfg.ConvexURL = convexURL
	}
}
