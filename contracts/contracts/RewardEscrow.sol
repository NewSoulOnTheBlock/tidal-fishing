// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import './Common.sol';

contract RewardEscrow is PausableLite {
    using SafeERC20Lite for IERC20Lite;
    bytes32 public constant CLAIM_TYPEHASH = keccak256('Claim(address player,uint256 amount,uint256 claimId,uint256 expiresAt)');
    bytes32 public immutable DOMAIN_SEPARATOR;
    IERC20Lite public immutable asset; address public rewardSigner; mapping(uint256=>bool) public claimed;
    event RewardClaimed(address indexed player,uint256 indexed claimId,uint256 amount); event RewardSignerUpdated(address indexed signer);
    constructor(IERC20Lite asset_, address rewardSigner_) { require(address(asset_)!=address(0),'asset=0'); require(rewardSigner_!=address(0),'signer=0'); asset=asset_; rewardSigner=rewardSigner_; DOMAIN_SEPARATOR=keccak256(abi.encode(keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'), keccak256(bytes('BullFishBlitzRewards')), keccak256(bytes('1')), block.chainid, address(this))); }
    function setRewardSigner(address signer) external onlyOwner { require(signer!=address(0),'signer=0'); rewardSigner=signer; emit RewardSignerUpdated(signer); }
    function claim(uint256 amount,uint256 claimId,uint256 expiresAt,bytes calldata signature) external whenNotPaused { require(block.timestamp<=expiresAt,'expired'); require(!claimed[claimId],'claimed'); bytes32 structHash=keccak256(abi.encode(CLAIM_TYPEHASH,msg.sender,amount,claimId,expiresAt)); bytes32 digest=keccak256(abi.encodePacked('\x19\x01',DOMAIN_SEPARATOR,structHash)); require(_recover(digest,signature)==rewardSigner,'bad sig'); claimed[claimId]=true; asset.safeTransfer(msg.sender,amount); emit RewardClaimed(msg.sender,claimId,amount); }
    function _recover(bytes32 digest, bytes memory sig) internal pure returns(address) { require(sig.length==65,'sig len'); bytes32 r; bytes32 s; uint8 v; assembly { r := mload(add(sig,32)) s := mload(add(sig,64)) v := byte(0,mload(add(sig,96))) } if(v<27) v+=27; return ecrecover(digest,v,r,s); }
}
