// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC-721 Fish NFT for Bull Fish Blitz. Free mints are gated by
/// server signatures earned through verified gameplay on Robinhood Chain.
contract BullFishBlitzFishNFT {
    string public name = "Bull Fish Blitz Fish";
    string public symbol = "BFBFISH";
    uint256 public constant MAX_SUPPLY = 500;
    uint256 public immutable chainId;
    address public owner;
    address public claimSigner;
    string public baseTokenURI;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(bytes32 => bool) public usedClaims;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event ClaimSignerUpdated(address indexed signer);
    event BaseURIUpdated(string baseURI);

    error NotOwner();
    error BadTokenId();
    error AlreadyMinted();
    error ClaimUsed();
    error BadSignature();
    error NotAuthorized();
    error NonexistentToken();

    constructor(address signer, string memory baseURI_) {
        owner = msg.sender;
        claimSigner = signer;
        baseTokenURI = baseURI_;
        chainId = block.chainid;
        emit ClaimSignerUpdated(signer);
        emit BaseURIUpdated(baseURI_);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function setClaimSigner(address signer) external onlyOwner {
        claimSigner = signer;
        emit ClaimSignerUpdated(signer);
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        baseTokenURI = baseURI_;
        emit BaseURIUpdated(baseURI_);
    }

    function transferOwnership(address nextOwner) external onlyOwner {
        owner = nextOwner;
    }

    function ownerOf(uint256 tokenId) public view returns (address tokenOwner) {
        tokenOwner = _owners[tokenId];
        if (tokenOwner == address(0)) revert NonexistentToken();
    }

    function balanceOf(address account) external view returns (uint256) {
        require(account != address(0), "zero address");
        return _balances[account];
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        ownerOf(tokenId);
        return string.concat(baseTokenURI, _toString(tokenId), ".json");
    }

    function claimHash(address to, uint256 tokenId, bytes32 nonce) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), block.chainid, to, tokenId, nonce));
    }

    function mintWithClaim(uint256 tokenId, bytes32 nonce, bytes calldata signature) external {
        if (tokenId == 0 || tokenId > MAX_SUPPLY) revert BadTokenId();
        if (_owners[tokenId] != address(0)) revert AlreadyMinted();
        bytes32 digest = claimHash(msg.sender, tokenId, nonce);
        if (usedClaims[digest]) revert ClaimUsed();
        if (_recover(_ethSignedMessageHash(digest), signature) != claimSigner) revert BadSignature();
        usedClaims[digest] = true;
        _mint(msg.sender, tokenId);
    }

    function approve(address spender, uint256 tokenId) external {
        address tokenOwner = ownerOf(tokenId);
        if (msg.sender != tokenOwner && !isApprovedForAll[tokenOwner][msg.sender]) revert NotAuthorized();
        getApproved[tokenId] = spender;
        emit Approval(tokenOwner, spender, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        address tokenOwner = ownerOf(tokenId);
        if (tokenOwner != from) revert NotAuthorized();
        if (msg.sender != from && msg.sender != getApproved[tokenId] && !isApprovedForAll[from][msg.sender]) revert NotAuthorized();
        require(to != address(0), "zero address");
        delete getApproved[tokenId];
        unchecked { _balances[from] -= 1; _balances[to] += 1; }
        _owners[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external { transferFrom(from, to, tokenId); }
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata) external { transferFrom(from, to, tokenId); }

    function _mint(address to, uint256 tokenId) internal {
        require(to != address(0), "zero address");
        _balances[to] += 1;
        _owners[tokenId] = to;
        emit Transfer(address(0), to, tokenId);
    }

    function _ethSignedMessageHash(bytes32 digest) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
    }

    function _recover(bytes32 digest, bytes memory sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        return ecrecover(digest, v, r, s);
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
