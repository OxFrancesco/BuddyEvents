// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../src/BuddyEvents.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Mock USDC for testing (6 decimal ERC20)
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        _mint(msg.sender, 1_000_000 * 10 ** 6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract BuddyEventsTest is Test {
    BuddyEvents public buddyEvents;
    MockUSDC public usdc;

    address public organizer = address(0x1);
    address public buyer = address(0x2);
    address public buyer2 = address(0x3);

    function setUp() public {
        usdc = new MockUSDC();
        buddyEvents = new BuddyEvents(address(usdc));

        usdc.mint(buyer, 1000 * 10 ** 6);
        usdc.mint(buyer2, 1000 * 10 ** 6);
    }

    function test_RevertConstructor_ZeroUSDC() public {
        vm.expectRevert("Zero USDC");
        new BuddyEvents(address(0));
    }

    function test_CreateEvent() public {
        vm.prank(organizer);
        uint256 eventId = buddyEvents.createEvent("ETH Denver", 10 * 10 ** 6, 100);

        (string memory name, uint256 price, uint256 maxTickets, uint256 ticketsSold, address org, bool active) =
            buddyEvents.getEvent(eventId);

        assertEq(name, "ETH Denver");
        assertEq(price, 10 * 10 ** 6);
        assertEq(maxTickets, 100);
        assertEq(ticketsSold, 0);
        assertEq(org, organizer);
        assertTrue(active);
    }

    function test_BuyTicket() public {
        vm.prank(organizer);
        uint256 eventId = buddyEvents.createEvent("ETH Denver", 10 * 10 ** 6, 100);

        vm.startPrank(buyer);
        usdc.approve(address(buddyEvents), 10 * 10 ** 6);
        uint256 tokenId = buddyEvents.buyTicket(eventId);
        vm.stopPrank();

        assertEq(buddyEvents.ownerOf(tokenId), buyer);
        assertEq(buddyEvents.ticketToEvent(tokenId), eventId);
    }

    function test_BuyFreeTicket() public {
        vm.prank(organizer);
        uint256 eventId = buddyEvents.createEvent("Free Meetup", 0, 50);

        vm.prank(buyer);
        uint256 tokenId = buddyEvents.buyTicket(eventId);

        assertEq(buddyEvents.ownerOf(tokenId), buyer);
    }

    function test_ListAndBuyTicket() public {
        vm.prank(organizer);
        uint256 eventId = buddyEvents.createEvent("ETH Denver", 10 * 10 ** 6, 100);

        vm.startPrank(buyer);
        usdc.approve(address(buddyEvents), 10 * 10 ** 6);
        uint256 tokenId = buddyEvents.buyTicket(eventId);
        buddyEvents.listTicket(tokenId, 15 * 10 ** 6);
        vm.stopPrank();

        vm.startPrank(buyer2);
        usdc.approve(address(buddyEvents), 15 * 10 ** 6);
        buddyEvents.buyListedTicket(tokenId);
        vm.stopPrank();

        assertEq(buddyEvents.ownerOf(tokenId), buyer2);
    }

    function test_EditEvent() public {
        vm.startPrank(organizer);
        uint256 eventId = buddyEvents.createEvent("ETH Denver", 10 * 10 ** 6, 100);
        buddyEvents.editEvent(eventId, "ETH Denver 2026", 20 * 10 ** 6);
        vm.stopPrank();

        (string memory name, uint256 price,,,,) = buddyEvents.getEvent(eventId);
        assertEq(name, "ETH Denver 2026");
        assertEq(price, 20 * 10 ** 6);
    }

    function test_RevertEditEvent_PriceLockedAfterSales() public {
        vm.prank(organizer);
        uint256 eventId = buddyEvents.createEvent("ETH Denver", 10 * 10 ** 6, 100);

        vm.startPrank(buyer);
        usdc.approve(address(buddyEvents), 10 * 10 ** 6);
        buddyEvents.buyTicket(eventId);
        vm.stopPrank();

        vm.prank(organizer);
        vm.expectRevert("Price locked after sales");
        buddyEvents.editEvent(eventId, "ETH Denver Price Change", 20 * 10 ** 6);
    }

    function test_EditEvent_NameAfterSales_SamePrice() public {
        vm.prank(organizer);
        uint256 eventId = buddyEvents.createEvent("ETH Denver", 10 * 10 ** 6, 100);

        vm.startPrank(buyer);
        usdc.approve(address(buddyEvents), 10 * 10 ** 6);
        buddyEvents.buyTicket(eventId);
        vm.stopPrank();

        vm.prank(organizer);
        buddyEvents.editEvent(eventId, "ETH Denver 2026", 10 * 10 ** 6);

        (string memory name, uint256 price,,,,) = buddyEvents.getEvent(eventId);
        assertEq(name, "ETH Denver 2026");
        assertEq(price, 10 * 10 ** 6);
    }

    function test_CancelEvent() public {
        vm.prank(organizer);
        uint256 eventId = buddyEvents.createEvent("ETH Denver", 10 * 10 ** 6, 100);

        vm.prank(organizer);
        buddyEvents.cancelEvent(eventId);

        (,,,,, bool active) = buddyEvents.getEvent(eventId);
        assertFalse(active);
    }

    function test_DelistTicket() public {
        vm.prank(organizer);
        uint256 eventId = buddyEvents.createEvent("ETH Denver", 10 * 10 ** 6, 100);

        vm.startPrank(buyer);
        usdc.approve(address(buddyEvents), 10 * 10 ** 6);
        uint256 tokenId = buddyEvents.buyTicket(eventId);
        buddyEvents.listTicket(tokenId, 15 * 10 ** 6);
        buddyEvents.delistTicket(tokenId);
        vm.stopPrank();

        (, , bool active) = buddyEvents.getListing(tokenId);
        assertFalse(active);
    }

    function test_AutoDelistOnTransfer() public {
        vm.prank(organizer);
        uint256 eventId = buddyEvents.createEvent("ETH Denver", 10 * 10 ** 6, 100);

        vm.startPrank(buyer);
        usdc.approve(address(buddyEvents), 10 * 10 ** 6);
        uint256 tokenId = buddyEvents.buyTicket(eventId);
        buddyEvents.listTicket(tokenId, 15 * 10 ** 6);
        buddyEvents.transferFrom(buyer, buyer2, tokenId);
        vm.stopPrank();

        (, , bool active) = buddyEvents.getListing(tokenId);
        assertFalse(active);
        assertEq(buddyEvents.ownerOf(tokenId), buyer2);
    }

    function test_RevertBuyTicket_SoldOut() public {
        vm.prank(organizer);
        uint256 eventId = buddyEvents.createEvent("Small Event", 1 * 10 ** 6, 1);

        vm.startPrank(buyer);
        usdc.approve(address(buddyEvents), 1 * 10 ** 6);
        buddyEvents.buyTicket(eventId);
        vm.stopPrank();

        vm.startPrank(buyer2);
        usdc.approve(address(buddyEvents), 1 * 10 ** 6);
        vm.expectRevert("Sold out");
        buddyEvents.buyTicket(eventId);
        vm.stopPrank();
    }

    function test_RevertBuyTicket_Cancelled() public {
        vm.prank(organizer);
        uint256 eventId = buddyEvents.createEvent("ETH Denver", 10 * 10 ** 6, 100);

        vm.prank(organizer);
        buddyEvents.cancelEvent(eventId);

        vm.prank(buyer);
        vm.expectRevert("Event not active");
        buddyEvents.buyTicket(eventId);
    }

    function test_RevertEditEvent_NotOrganizer() public {
        vm.prank(organizer);
        uint256 eventId = buddyEvents.createEvent("ETH Denver", 10 * 10 ** 6, 100);

        vm.prank(buyer);
        vm.expectRevert("Not organizer");
        buddyEvents.editEvent(eventId, "Hacked", 0);
    }

    function test_RevertCancelEvent_NotAuthorized() public {
        vm.prank(organizer);
        uint256 eventId = buddyEvents.createEvent("ETH Denver", 10 * 10 ** 6, 100);

        vm.prank(buyer);
        vm.expectRevert("Not authorized");
        buddyEvents.cancelEvent(eventId);
    }
}
