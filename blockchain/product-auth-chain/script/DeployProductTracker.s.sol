// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ProductTracker} from "../src/ProductTracker.sol";

contract DeployProductTracker is Script {

    function run() external returns (ProductTracker) {
        // Load deployer private key from .env
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        console.log("==============================================");
        console.log("  Deploying ProductTracker...");
        console.log("==============================================");

        vm.startBroadcast(deployerKey);

        ProductTracker tracker = new ProductTracker();

        vm.stopBroadcast();

        console.log("ProductTracker deployed at:", address(tracker));
        console.log("Contract owner:", tracker.contractOwner());
        console.log("==============================================");

        return tracker;
    }
}