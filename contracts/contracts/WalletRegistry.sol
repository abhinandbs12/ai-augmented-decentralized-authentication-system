// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title WalletRegistry - BlockAuth on-chain identity status registry
contract WalletRegistry {
    enum Status { None, Active, Revoked }

    struct WalletRecord {
        Status status;
        uint64 registeredAt;
    }

    address public immutable admin;
    mapping(address => WalletRecord) private records;

    event WalletRegistered(address indexed wallet, uint64 registeredAt);
    event WalletRevoked(address indexed wallet, uint64 revokedAt);
    event WalletActivated(address indexed wallet, uint64 activatedAt);

    error NotAdmin();
    error ZeroAddress();
    error AlreadyRegistered();
    error NotRegistered();
    error AlreadyRevoked();
    error AlreadyActive();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier nonZero(address wallet) {
        if (wallet == address(0)) revert ZeroAddress();
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function registerWallet(address wallet) external onlyAdmin nonZero(wallet) {
        if (records[wallet].status != Status.None) revert AlreadyRegistered();
        uint64 ts = uint64(block.timestamp);
        records[wallet] = WalletRecord(Status.Active, ts);
        emit WalletRegistered(wallet, ts);
    }

    function revokeWallet(address wallet) external onlyAdmin nonZero(wallet) {
        Status s = records[wallet].status;
        if (s == Status.None) revert NotRegistered();
        if (s == Status.Revoked) revert AlreadyRevoked();
        records[wallet].status = Status.Revoked;
        emit WalletRevoked(wallet, uint64(block.timestamp));
    }

    function activateWallet(address wallet) external onlyAdmin nonZero(wallet) {
        Status s = records[wallet].status;
        if (s == Status.None) revert NotRegistered();
        if (s == Status.Active) revert AlreadyActive();
        records[wallet].status = Status.Active;
        emit WalletActivated(wallet, uint64(block.timestamp));
    }

    function isRegistered(address wallet) external view returns (bool) {
        return records[wallet].status != Status.None;
    }

    function isActive(address wallet) external view returns (bool) {
        return records[wallet].status == Status.Active;
    }

    function getWalletStatus(address wallet)
        external
        view
        returns (bool registered, bool active, uint64 registeredAt)
    {
        WalletRecord memory r = records[wallet];
        return (r.status != Status.None, r.status == Status.Active, r.registeredAt);
    }
}
