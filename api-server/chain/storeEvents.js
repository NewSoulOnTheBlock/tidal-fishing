import { Interface, getAddress, id } from 'ethers';
export const storeIface = new Interface(['event ItemPurchased(address indexed buyer,bytes32 indexed itemType,bytes32 indexed itemId,uint256 quantity,uint256 grossAmount)']);
export function itemKey(value) { return id(String(value)); }
export function decodeItemPurchasedLog(log) {
  try {
    const parsed = storeIface.parseLog(log);
    if (parsed?.name !== 'ItemPurchased') return null;
    return { buyer: getAddress(parsed.args.buyer), itemType: parsed.args.itemType, itemId: parsed.args.itemId, quantity: Number(parsed.args.quantity), grossAmount: parsed.args.grossAmount.toString() };
  } catch { return null; }
}
