/// cli/cmd/events.go — Event management commands
/// list, create, edit, cancel events via API
package cmd

import (
	"encoding/json"
	"fmt"

	"buddyevents/internal/api"

	"github.com/spf13/cobra"
)

var eventsCmd = &cobra.Command{
	Use:   "events",
	Short: "Manage events (list, create, edit, cancel)",
}

// ===== events list =====
var eventsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List available events",
	RunE: func(cmd *cobra.Command, args []string) error {
		status, _ := cmd.Flags().GetString("status")

		client := api.NewClient(cfg.APIURL)
		events, err := client.ListEvents(status)
		if err != nil {
			return fmt.Errorf("failed to list events: %w", err)
		}

		out, _ := json.MarshalIndent(events, "", "  ")
		fmt.Println(string(out))
		return nil
	},
}

// ===== events create =====
var eventsCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new event",
	RunE: func(cmd *cobra.Command, args []string) error {
		name, _ := cmd.Flags().GetString("name")
		desc, _ := cmd.Flags().GetString("description")
		start, _ := cmd.Flags().GetInt64("start")
		end, _ := cmd.Flags().GetInt64("end")
		price, _ := cmd.Flags().GetFloat64("price")
		maxTickets, _ := cmd.Flags().GetInt("max-tickets")
		teamID, _ := cmd.Flags().GetString("team-id")
		location, _ := cmd.Flags().GetString("location")
		creator, _ := cmd.Flags().GetString("creator")

		if creator == "" {
			creator = cfg.WalletAddress
		}

		client := api.NewClient(cfg.APIURL)
		eventID, err := client.CreateEvent(api.CreateEventRequest{
			Name:           name,
			Description:    desc,
			StartTime:      start,
			EndTime:        end,
			Price:          price,
			MaxTickets:     maxTickets,
			TeamID:         teamID,
			Location:       location,
			CreatorAddress: creator,
		})
		if err != nil {
			return fmt.Errorf("failed to create event: %w", err)
		}

		fmt.Printf("Event created: %s\n", eventID)
		return nil
	},
}

// ===== events cancel =====
var eventsCancelCmd = &cobra.Command{
	Use:   "cancel",
	Short: "Cancel an event",
	RunE: func(cmd *cobra.Command, args []string) error {
		id, _ := cmd.Flags().GetString("id")
		if id == "" {
			return fmt.Errorf("--id is required")
		}

		client := api.NewClient(cfg.APIURL)
		err := client.CancelEvent(id)
		if err != nil {
			return fmt.Errorf("failed to cancel event: %w", err)
		}

		fmt.Printf("Event %s cancelled\n", id)
		return nil
	},
}

func init() {
	// events list flags
	eventsListCmd.Flags().String("status", "", "Filter by status (active, ended, cancelled)")

	// events create flags
	eventsCreateCmd.Flags().String("name", "", "Event name (required)")
	eventsCreateCmd.Flags().String("description", "", "Event description")
	eventsCreateCmd.Flags().Int64("start", 0, "Start time (unix ms, required)")
	eventsCreateCmd.Flags().Int64("end", 0, "End time (unix ms, required)")
	eventsCreateCmd.Flags().Float64("price", 0, "Ticket price in USDC")
	eventsCreateCmd.Flags().Int("max-tickets", 100, "Maximum tickets available")
	eventsCreateCmd.Flags().String("team-id", "", "Organizer team ID (required)")
	eventsCreateCmd.Flags().String("location", "", "Event location")
	eventsCreateCmd.Flags().String("creator", "", "Creator wallet address (defaults to config)")
	_ = eventsCreateCmd.MarkFlagRequired("name")
	_ = eventsCreateCmd.MarkFlagRequired("start")
	_ = eventsCreateCmd.MarkFlagRequired("end")
	_ = eventsCreateCmd.MarkFlagRequired("team-id")

	// events cancel flags
	eventsCancelCmd.Flags().String("id", "", "Event ID to cancel")

	eventsCmd.AddCommand(eventsListCmd)
	eventsCmd.AddCommand(eventsCreateCmd)
	eventsCmd.AddCommand(eventsCancelCmd)
}
