// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @notice Deploy BuddyEvents to Monad testnet or mainnet

import "forge-std/Script.sol";
import "../src/BuddyEvents.sol";

contract DeployScript is Script {
    // Monad Testnet USDC (Circle)
    address constant MONAD_USDC_TESTNET = 0x534b2f3A21130d7a60830c2Df862319e593943A3;

    function run() external {
        // For mainnet or custom deployments set USDC_ADDRESS in env.
        // If omitted, default to Monad testnet USDC for hackathon flow.
        address usdcAddress = vm.envOr("USDC_ADDRESS", MONAD_USDC_TESTNET);

        vm.startBroadcast();
        BuddyEvents buddyEvents = new BuddyEvents(usdcAddress);
        console.log("USDC address:", usdcAddress);
        console.log("BuddyEvents deployed at:", address(buddyEvents));
        vm.stopBroadcast();
    }
}
