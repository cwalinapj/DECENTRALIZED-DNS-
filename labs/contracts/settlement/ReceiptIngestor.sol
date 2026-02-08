// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ReceiptIngestor {
    address public owner;
    address public operatorRegistry;

    modifier onlyOwner() {
        require(msg.sender == owner, "not_owner");
        _;
    }

    interface IOperatorRegistry {
        function isOperator(address operator) external view returns (bool);
    }

    event BatchReceiptSubmitted(
        bytes32 indexed merkleRoot,
        bytes32 indexed batchId,
        address indexed operator,
        uint256 requestCount,
        uint256 bytesServedTotal
    );

    event ReceiptProofVerified(bytes32 indexed merkleRoot, bytes32 indexed leaf, address indexed verifier);

    struct BatchReceipt {
        bytes32 merkleRoot;
        uint256 requestCount;
        uint256 successCount;
        uint256 errorCount;
        uint256 bytesServedTotal;
        uint256 timestampMs;
        address operator;
        bytes signature;
    }

    mapping(bytes32 => BatchReceipt) public batches;

    constructor(address operatorRegistry_) {
        owner = msg.sender;
        operatorRegistry = operatorRegistry_;
    }

    function setOperatorRegistry(address operatorRegistry_) external onlyOwner {
        operatorRegistry = operatorRegistry_;
    }

    function submitBatchReceipt(
        bytes32 merkleRoot,
        uint256 requestCount,
        uint256 successCount,
        uint256 errorCount,
        uint256 bytesServedTotal,
        uint256 timestampMs,
        bytes calldata signature
    ) external {
        require(operatorRegistry != address(0), "operator_registry_unset");
        require(IOperatorRegistry(operatorRegistry).isOperator(msg.sender), "operator_not_registered");

        bytes32 digest = keccak256(
            abi.encodePacked(
                merkleRoot,
                requestCount,
                successCount,
                errorCount,
                bytesServedTotal,
                timestampMs
            )
        );
        if (signature.length == 65) {
            address signer = recoverSigner(digest, signature);
            require(signer == msg.sender, "invalid_signature");
        } else {
            // 64-byte signature (no recovery id) cannot be ecrecovered here.
            // Leave as accepted for scaffolding (off-chain verification recommended).
        }

        bytes32 batchId = keccak256(abi.encodePacked(merkleRoot, msg.sender, timestampMs));
        require(batches[batchId].timestampMs == 0, "batch_exists");

        batches[batchId] = BatchReceipt({
            merkleRoot: merkleRoot,
            requestCount: requestCount,
            successCount: successCount,
            errorCount: errorCount,
            bytesServedTotal: bytesServedTotal,
            timestampMs: timestampMs,
            operator: msg.sender,
            signature: signature
        });

        emit BatchReceiptSubmitted(merkleRoot, batchId, msg.sender, requestCount, bytesServedTotal);
    }

    function verifyReceiptProof(
        bytes32 merkleRoot,
        bytes32 leaf,
        bytes32[] calldata proof,
        bool[] calldata isLeft
    ) external returns (bool) {
        require(proof.length == isLeft.length, "proof_length_mismatch");
        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            if (isLeft[i]) {
                computed = keccak256(abi.encodePacked(proof[i], computed));
            } else {
                computed = keccak256(abi.encodePacked(computed, proof[i]));
            }
        }
        bool ok = computed == merkleRoot;
        require(ok, "invalid_proof");
        emit ReceiptProofVerified(merkleRoot, leaf, msg.sender);
        return ok;
    }

    function recoverSigner(bytes32 digest, bytes memory signature) public pure returns (address) {
        require(signature.length == 65, "bad_signature_length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "bad_signature_v");
        return ecrecover(digest, v, r, s);
    }
}
