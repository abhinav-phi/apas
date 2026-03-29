// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ProductTracker} from "../src/ProductTracker.sol";

contract DeployProductTrackerSepolia is Script {

    function run() external returns (ProductTracker) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        console.log("DEPLOYING TO SEPOLIA TESTNET");
        console.log("Deployer:", deployer);
        console.log("Balance:", deployer.balance);

        vm.startBroadcast(deployerKey);

        ProductTracker tracker = new ProductTracker();

        vm.stopBroadcast();
        console.log("ProductTracker:", address(tracker));
        console.log("Owner:", tracker.contractOwner());
        return tracker;
    }
}