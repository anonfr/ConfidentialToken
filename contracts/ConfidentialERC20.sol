// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "fhevm/lib/TFHE.sol";
import "fhevm/config/ZamaFHEVMConfig.sol";
import "fhevm/config/ZamaGatewayConfig.sol";
import "fhevm/gateway/GatewayCaller.sol";

/// @title ConfidentialERC20
/// @notice ERC-20 token with fully encrypted balances using Zama's fhEVM.
/// Balances are stored as euint64 ciphertexts — only the owner (or approved
/// addresses) can decrypt their own balance via the Gateway.
contract ConfidentialERC20 is SepoliaZamaFHEVMConfig, SepoliaZamaGatewayConfig, GatewayCaller {
    // --- Metadata ---
    string public name;
    string public symbol;
    uint8 public constant decimals = 6;
    uint64 public totalSupply;
    address public owner;

    // --- Encrypted state ---
    mapping(address => euint64) internal _balances;
    mapping(address => mapping(address => euint64)) internal _allowances;

    // --- Decryption requests ---
    mapping(uint256 => address) public decryptionRequester;
    mapping(address => uint64) public latestDecryptedBalance;

    // --- Events ---
    event Transfer(address indexed from, address indexed to);
    event Approval(address indexed owner, address indexed spender);
    event Mint(address indexed to, uint64 amount);
    event DecryptionRequest(uint256 indexed requestId, address indexed requester);
    event BalanceDecrypted(address indexed account, uint64 balance);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
        owner = msg.sender;
    }

    /// @notice Mint tokens to an address (owner only). The amount is trivially
    ///         encrypted on-chain so the balance stays in ciphertext form.
    function mint(address to, uint64 amount) external onlyOwner {
        totalSupply += amount;
        euint64 encAmount = TFHE.asEuint64(amount);
        _balances[to] = TFHE.add(_balances[to], encAmount);
        TFHE.allow(_balances[to], address(this));
        TFHE.allow(_balances[to], to);
        emit Mint(to, amount);
    }

    /// @notice Transfer encrypted tokens. The caller submits an encrypted amount
    ///         via the fhevmjs SDK (einput + inputProof).
    /// @param to Recipient address
    /// @param encryptedAmount The encrypted amount handle from fhevmjs
    /// @param inputProof The ZKPoK proof from fhevmjs
    function transfer(address to, einput encryptedAmount, bytes calldata inputProof) external {
        euint64 amount = TFHE.asEuint64(encryptedAmount, inputProof);
        _transfer(msg.sender, to, amount);
    }

    /// @notice Transfer using an already-existing on-chain euint64 handle.
    function transferEncrypted(address to, euint64 amount) external {
        _transfer(msg.sender, to, amount);
    }

    /// @notice Approve a spender for an encrypted allowance.
    function approve(address spender, einput encryptedAmount, bytes calldata inputProof) external {
        euint64 amount = TFHE.asEuint64(encryptedAmount, inputProof);
        _approve(msg.sender, spender, amount);
    }

    /// @notice transferFrom using encrypted allowance.
    function transferFrom(
        address from,
        address to,
        einput encryptedAmount,
        bytes calldata inputProof
    ) external {
        euint64 amount = TFHE.asEuint64(encryptedAmount, inputProof);
        euint64 currentAllowance = _allowances[from][msg.sender];
        // Ensure spender has sufficient allowance
        ebool hasEnough = TFHE.le(amount, currentAllowance);
        euint64 transferAmount = TFHE.select(hasEnough, amount, TFHE.asEuint64(0));
        // Decrease allowance
        _allowances[from][msg.sender] = TFHE.sub(currentAllowance, transferAmount);
        TFHE.allow(_allowances[from][msg.sender], address(this));
        TFHE.allow(_allowances[from][msg.sender], from);
        TFHE.allow(_allowances[from][msg.sender], msg.sender);
        _transfer(from, to, transferAmount);
    }

    /// @notice Request decryption of your own balance via the Gateway.
    ///         The result is delivered asynchronously to the callback.
    function requestBalanceDecryption() external returns (uint256) {
        euint64 balance = _balances[msg.sender];
        uint256[] memory cts = new uint256[](1);
        cts[0] = Gateway.toUint256(balance);
        uint256 requestId = Gateway.requestDecryption(
            cts,
            this.onBalanceDecrypted.selector,
            0,
            block.timestamp + 100,
            false
        );
        decryptionRequester[requestId] = msg.sender;
        emit DecryptionRequest(requestId, msg.sender);
        return requestId;
    }

    /// @notice Gateway callback with the decrypted balance.
    function onBalanceDecrypted(uint256 requestId, uint64 decryptedBalance) external onlyGateway {
        address requester = decryptionRequester[requestId];
        require(requester != address(0), "Unknown request");
        latestDecryptedBalance[requester] = decryptedBalance;
        emit BalanceDecrypted(requester, decryptedBalance);
    }

    // --- Internal ---

    function _transfer(address from, address to, euint64 amount) internal {
        // If amount > balance, transfer 0 (no revert to avoid leaking info)
        ebool hasEnough = TFHE.le(amount, _balances[from]);
        euint64 transferAmount = TFHE.select(hasEnough, amount, TFHE.asEuint64(0));

        _balances[from] = TFHE.sub(_balances[from], transferAmount);
        _balances[to] = TFHE.add(_balances[to], transferAmount);

        // Grant ACL permissions
        TFHE.allow(_balances[from], address(this));
        TFHE.allow(_balances[from], from);
        TFHE.allow(_balances[to], address(this));
        TFHE.allow(_balances[to], to);

        emit Transfer(from, to);
    }

    function _approve(address _owner, address spender, euint64 amount) internal {
        _allowances[_owner][spender] = amount;
        TFHE.allow(_allowances[_owner][spender], address(this));
        TFHE.allow(_allowances[_owner][spender], _owner);
        TFHE.allow(_allowances[_owner][spender], spender);
        emit Approval(_owner, spender);
    }
}
