// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import './Common.sol';

contract BaitStore is OwnableLite {
    using SafeERC20Lite for IERC20Lite;
    struct Pack { uint256 price; bool active; }
    IERC20Lite public immutable asset;
    address public operatorTreasury; address public rewardPool; address public lpReserve; address public sponsorReserve;
    uint16 public constant OPERATOR_BPS=2500; uint16 public constant REWARD_BPS=6500; uint16 public constant LP_BPS=700; uint16 public constant SPONSOR_BPS=300;
    mapping(uint256=>Pack) public packs; mapping(bytes32=>uint256) public itemPrices; mapping(bytes32=>bool) public itemActive;
    event BaitPackPurchased(address indexed buyer,uint256 indexed packId,uint256 quantity,uint256 grossAmount);
    event ItemPurchased(address indexed buyer,bytes32 indexed itemType,bytes32 indexed itemId,uint256 quantity,uint256 grossAmount);
    event PackUpdated(uint256 indexed packId,uint256 price,bool active); event ItemUpdated(bytes32 indexed itemId,uint256 price,bool active);
    constructor(IERC20Lite asset_,address operatorTreasury_,address rewardPool_,address lpReserve_,address sponsorReserve_) { require(address(asset_)!=address(0),'asset=0'); require(operatorTreasury_!=address(0)&&rewardPool_!=address(0)&&lpReserve_!=address(0)&&sponsorReserve_!=address(0),'addr=0'); require(OPERATOR_BPS+REWARD_BPS+LP_BPS+SPONSOR_BPS==10000,'split'); asset=asset_; operatorTreasury=operatorTreasury_; rewardPool=rewardPool_; lpReserve=lpReserve_; sponsorReserve=sponsorReserve_; packs[1]=Pack(10 ether,true); packs[2]=Pack(25 ether,true); packs[3]=Pack(100 ether,true); }
    function setPack(uint256 packId,uint256 price,bool active) external onlyOwner { packs[packId]=Pack(price,active); emit PackUpdated(packId,price,active); }
    function setItem(bytes32 itemId,uint256 price,bool active) external onlyOwner { itemPrices[itemId]=price; itemActive[itemId]=active; emit ItemUpdated(itemId,price,active); }
    function buyBaitPack(uint256 packId,uint256 quantity) external { Pack memory p=packs[packId]; require(p.active,'inactive'); require(quantity>0&&quantity<=100,'quantity'); uint256 gross=p.price*quantity; _splitFrom(msg.sender,gross); emit BaitPackPurchased(msg.sender,packId,quantity,gross); }
    function buyItem(bytes32 itemType,bytes32 itemId,uint256 quantity) external { require(itemActive[itemId],'inactive'); require(quantity>0&&quantity<=100,'quantity'); uint256 gross=itemPrices[itemId]*quantity; require(gross>0,'price=0'); _splitFrom(msg.sender,gross); emit ItemPurchased(msg.sender,itemType,itemId,quantity,gross); }
    function _splitFrom(address buyer,uint256 gross) internal { asset.safeTransferFrom(buyer,operatorTreasury,gross*OPERATOR_BPS/10000); asset.safeTransferFrom(buyer,rewardPool,gross*REWARD_BPS/10000); asset.safeTransferFrom(buyer,lpReserve,gross*LP_BPS/10000); asset.safeTransferFrom(buyer,sponsorReserve,gross*SPONSOR_BPS/10000); }
}
