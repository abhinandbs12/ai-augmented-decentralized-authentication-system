// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title AuthRegistry
 * @dev Manages user registration, cryptographic signature verification,
 * Merkle root anchoring for audit batches, and circuit breaker authentication controls.
 */
contract AuthRegistry {
    using ECDSA for bytes32;

    address public admin;
    bool public paused;
    mapping(address => bool) public isRegistered;
    mapping(address => bytes32) public usedNonces;
    bytes32[] public merkleRoots;

    event UserRegistered(address indexed wallet);
    event LoginVerified(address indexed wallet, uint256 timestamp);
    event MerkleRootSubmitted(bytes32 root, uint256 batchId);
    event AuthPaused(address indexed by);
    event AuthResumed(address indexed by);

    modifier onlyAdmin() {
        require(msg.sender == admin, "AuthRegistry: caller is not admin");
        _;
    }

    modifier notPaused() {
        require(!paused, "AuthRegistry: authentication is paused");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function registerUser() external notPaused {
        require(!isRegistered[msg.sender], "AuthRegistry: already registered");
        isRegistered[msg.sender] = true;
        emit UserRegistered(msg.sender);
    }

    function verifySignature(
        address wallet,
        bytes32 nonce,
        bytes calldata signature
    ) external notPaused returns (bool) {
        require(isRegistered[wallet], "AuthRegistry: wallet not registered");
        require(usedNonces[wallet] != nonce, "AuthRegistry: nonce already used");

        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(nonce);
        address recovered = ethSignedHash.recover(signature);
        require(recovered == wallet, "AuthRegistry: invalid signature");

        usedNonces[wallet] = nonce;
        emit LoginVerified(wallet, block.timestamp);
        return true;
    }

    function submitMerkleRoot(bytes32 root) external onlyAdmin {
        merkleRoots.push(root);
        emit MerkleRootSubmitted(root, merkleRoots.length - 1);
    }

    function getMerkleRoot(uint256 batchId) external view returns (bytes32) {
        require(batchId < merkleRoots.length, "AuthRegistry: invalid batch id");
        return merkleRoots[batchId];
    }

    function pauseAuth() external onlyAdmin {
        paused = true;
        emit AuthPaused(msg.sender);
    }

    function resumeAuth() external onlyAdmin {
        paused = false;
        emit AuthResumed(msg.sender);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "AuthRegistry: zero address");
        admin = newAdmin;
    }
}
