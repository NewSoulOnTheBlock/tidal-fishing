// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Lite { function transfer(address to,uint256 amount) external returns (bool); function transferFrom(address from,address to,uint256 amount) external returns (bool); function balanceOf(address account) external view returns (uint256); }
library SafeERC20Lite { function safeTransfer(IERC20Lite t,address to,uint256 a) internal { require(t.transfer(to,a), 'TRANSFER_FAILED'); } function safeTransferFrom(IERC20Lite t,address f,address to,uint256 a) internal { require(t.transferFrom(f,to,a), 'TRANSFER_FROM_FAILED'); } }
contract OwnableLite { address public owner; event OwnershipTransferred(address indexed previousOwner,address indexed newOwner); constructor(){ owner=msg.sender; emit OwnershipTransferred(address(0), msg.sender); } modifier onlyOwner(){ require(msg.sender==owner,'not owner'); _; } function transferOwnership(address next) external onlyOwner { require(next!=address(0),'owner=0'); emit OwnershipTransferred(owner,next); owner=next; } }
contract PausableLite is OwnableLite { bool public paused; event Paused(address account); event Unpaused(address account); modifier whenNotPaused(){ require(!paused,'paused'); _; } function pause() external onlyOwner { paused=true; emit Paused(msg.sender); } function unpause() external onlyOwner { paused=false; emit Unpaused(msg.sender); } }
