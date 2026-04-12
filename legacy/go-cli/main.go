/// cli/main.go — BuddyEvents CLI entry point
/// Pi agent uses this via its Bash tool to manage events and tickets
package main

import "buddyevents/cmd"

func main() {
	cmd.Execute()
}
