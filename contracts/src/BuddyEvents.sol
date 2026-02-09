// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title BuddyEvents - Agent-native event ticketing on Monad
/// @notice Event registry with ERC-721 ticket NFTs and USDC-based secondary marketplace
/// @dev Payments use approve+transferFrom pattern with USDC (6 decimals)

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract BuddyEvents is ERC721, Ownable, ReentrancyGuard {
    IERC20 public immutable usdc;

    uint256 public nextEventId;
    uint256 public nextTicketId;

    struct Event {
        string name;
        uint256 priceInUSDC; // 6 decimals: 1 USDC = 1_000_000
        uint256 maxTickets;
        uint256 ticketsSold;
        address organizer;
        bool active;
    }

    struct Listing {
        uint256 price;
        address seller;
        bool active;
    }

    mapping(uint256 => Event) public events;
    mapping(uint256 => uint256) public ticketToEvent;
    mapping(uint256 => Listing) public listings;

    event EventCreated(
        uint256 indexed eventId, string name, uint256 price, uint256 maxTickets, address indexed organizer
    );
    event EventUpdated(uint256 indexed eventId, string name, uint256 price);
    event EventCancelled(uint256 indexed eventId);
    event TicketPurchased(uint256 indexed eventId, uint256 indexed tokenId, address indexed buyer, uint256 price);
    event TicketListed(uint256 indexed tokenId, uint256 price, address indexed seller);
    event TicketDelisted(uint256 indexed tokenId);
    event TicketSold(uint256 indexed tokenId, uint256 price, address seller, address buyer);

    constructor(address _usdc) ERC721("BuddyEvents Ticket", "BTIX") Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    // ========== Event Management ==========

    function createEvent(string calldata name, uint256 priceInUSDC, uint256 maxTickets)
        external
        returns (uint256 eventId)
    {
        require(bytes(name).length > 0, "Empty name");
        require(maxTickets > 0, "Zero tickets");

        eventId = nextEventId++;
        events[eventId] = Event({
            name: name,
            priceInUSDC: priceInUSDC,
            maxTickets: maxTickets,
            ticketsSold: 0,
            organizer: msg.sender,
            active: true
        });

        emit EventCreated(eventId, name, priceInUSDC, maxTickets, msg.sender);
    }

    function editEvent(uint256 eventId, string calldata name, uint256 priceInUSDC) external {
        Event storage evt = events[eventId];
        require(evt.organizer == msg.sender, "Not organizer");
        require(evt.active, "Event cancelled");

        if (bytes(name).length > 0) evt.name = name;
        evt.priceInUSDC = priceInUSDC;

        emit EventUpdated(eventId, evt.name, priceInUSDC);
    }

    function cancelEvent(uint256 eventId) external {
        Event storage evt = events[eventId];
        require(evt.organizer == msg.sender || owner() == msg.sender, "Not authorized");
        require(evt.active, "Already cancelled");

        evt.active = false;
        emit EventCancelled(eventId);
    }

    // ========== Ticket Purchase ==========

    function buyTicket(uint256 eventId) external nonReentrant returns (uint256 tokenId) {
        Event storage evt = events[eventId];
        require(evt.active, "Event not active");
        require(evt.ticketsSold < evt.maxTickets, "Sold out");

        if (evt.priceInUSDC > 0) {
            require(usdc.transferFrom(msg.sender, evt.organizer, evt.priceInUSDC), "USDC transfer failed");
        }

        tokenId = nextTicketId++;
        _mint(msg.sender, tokenId);
        ticketToEvent[tokenId] = eventId;
        evt.ticketsSold++;

        emit TicketPurchased(eventId, tokenId, msg.sender, evt.priceInUSDC);
    }

    // ========== Secondary Market ==========

    function listTicket(uint256 tokenId, uint256 price) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        require(!listings[tokenId].active, "Already listed");

        listings[tokenId] = Listing({price: price, seller: msg.sender, active: true});

        emit TicketListed(tokenId, price, msg.sender);
    }

    function delistTicket(uint256 tokenId) external {
        Listing storage listing = listings[tokenId];
        require(listing.seller == msg.sender, "Not seller");
        require(listing.active, "Not listed");

        listing.active = false;
        emit TicketDelisted(tokenId);
    }

    function buyListedTicket(uint256 tokenId) external nonReentrant {
        Listing storage listing = listings[tokenId];
        require(listing.active, "Not listed");

        address seller = listing.seller;
        uint256 price = listing.price;

        require(ownerOf(tokenId) == seller, "Seller no longer owns");

        if (price > 0) {
            require(usdc.transferFrom(msg.sender, seller, price), "USDC transfer failed");
        }

        _transfer(seller, msg.sender, tokenId);
        listing.active = false;

        emit TicketSold(tokenId, price, seller, msg.sender);
    }

    // ========== View Functions ==========

    function getEvent(uint256 eventId)
        external
        view
        returns (
            string memory name,
            uint256 priceInUSDC,
            uint256 maxTickets,
            uint256 ticketsSold,
            address organizer,
            bool active
        )
    {
        Event storage evt = events[eventId];
        return (evt.name, evt.priceInUSDC, evt.maxTickets, evt.ticketsSold, evt.organizer, evt.active);
    }

    function getListing(uint256 tokenId) external view returns (uint256 price, address seller, bool active) {
        Listing storage listing = listings[tokenId];
        return (listing.price, listing.seller, listing.active);
    }
}
