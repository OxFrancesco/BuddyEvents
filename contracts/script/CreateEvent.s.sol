// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @notice Create an event on the deployed BuddyEvents contract

import "forge-std/Script.sol";
import "../src/BuddyEvents.sol";

contract CreateEventScript is Script {
    function run() external {
        address deployed = vm.envAddress("BUDDY_EVENTS_CONTRACT");
        BuddyEvents buddyEvents = BuddyEvents(deployed);

        vm.startBroadcast();
        uint256 eventId = buddyEvents.createEvent(
            unicode"Francesco's participation!",
            0, // free event (0 USDC)
            100 // max tickets
        );
        console.log("Created event ID:", eventId);
        vm.stopBroadcast();
    }
}
