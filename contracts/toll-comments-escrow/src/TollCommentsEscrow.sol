// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TollCommentsEscrow {
    struct Deposit {
        address payer;
        uint256 amount;
        uint64 depositedAt;
        bool refunded;
        bool forfeited;
    }

    mapping(bytes32 => Deposit) public deposits;

    address public immutable treasury;
    address public refundOperator;
    address public forfeitOperator;
    uint64 public forfeitDelay;
    address public owner;
    bool private locked;

    event Deposited(bytes32 indexed intentId, address indexed payer, uint256 amount);
    event Refunded(bytes32 indexed intentId, address indexed payer, uint256 amount, uint256 bonus);
    event Forfeited(bytes32 indexed intentId, address indexed payer, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, 'Not owner');
        _;
    }

    modifier onlyRefundOperator() {
        require(msg.sender == refundOperator, 'Not refund operator');
        _;
    }

    modifier nonReentrant() {
        require(!locked, 'Reentrancy');
        locked = true;
        _;
        locked = false;
    }

    constructor(
        address treasury_,
        address refundOperator_,
        address forfeitOperator_,
        uint64 forfeitDelay_
    ) {
        require(treasury_ != address(0), 'Treasury required');
        require(refundOperator_ != address(0), 'Refund operator required');
        require(forfeitOperator_ != address(0), 'Forfeit operator required');
        owner = msg.sender;
        treasury = treasury_;
        refundOperator = refundOperator_;
        forfeitOperator = forfeitOperator_;
        forfeitDelay = forfeitDelay_;
    }

    function deposit(bytes32 intentId) external payable {
        require(msg.value > 0, 'Amount required');
        Deposit storage existing = deposits[intentId];
        require(existing.payer == address(0), 'Intent already deposited');
        deposits[intentId] = Deposit({
            payer: msg.sender,
            amount: msg.value,
            depositedAt: uint64(block.timestamp),
            refunded: false,
            forfeited: false
        });
        emit Deposited(intentId, msg.sender, msg.value);
    }

    function refund(bytes32 intentId) external payable onlyRefundOperator nonReentrant {
        Deposit storage record = deposits[intentId];
        require(record.payer != address(0), 'Deposit missing');
        require(!record.refunded && !record.forfeited, 'Already processed');
        record.refunded = true;
        uint256 payout = record.amount + msg.value;
        (bool ok, ) = record.payer.call{value: payout}("");
        require(ok, 'Refund failed');
        emit Refunded(intentId, record.payer, record.amount, msg.value);
    }

    function forfeit(bytes32 intentId) external nonReentrant {
        Deposit storage record = deposits[intentId];
        require(record.payer != address(0), 'Deposit missing');
        require(!record.refunded && !record.forfeited, 'Already processed');
        bool isOperator = msg.sender == forfeitOperator;
        bool afterDeadline = block.timestamp >= record.depositedAt + forfeitDelay;
        require(isOperator || afterDeadline, 'Not authorized');
        record.forfeited = true;
        (bool ok, ) = treasury.call{value: record.amount}("");
        require(ok, 'Forfeit failed');
        emit Forfeited(intentId, record.payer, record.amount);
    }

    function updateOperators(address refundOperator_, address forfeitOperator_) external onlyOwner {
        require(refundOperator_ != address(0), 'Refund operator required');
        require(forfeitOperator_ != address(0), 'Forfeit operator required');
        refundOperator = refundOperator_;
        forfeitOperator = forfeitOperator_;
    }

    function updateForfeitDelay(uint64 forfeitDelay_) external onlyOwner {
        forfeitDelay = forfeitDelay_;
    }
}
