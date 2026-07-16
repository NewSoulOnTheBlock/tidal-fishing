import { Interface, getAddress } from 'ethers';
export const baitStoreIface = new Interface(['event BaitPackPurchased(address indexed buyer,uint256 indexed packId,uint256 quantity,uint256 grossAmount)']);
export function decodeBaitPurchaseLog(log) {
  try {
    const parsed = baitStoreIface.parseLog(log);
    if (parsed?.name !== 'BaitPackPurchased') return null;
    return { buyer: getAddress(parsed.args.buyer), packId: parsed.args.packId.toString(), quantity: Number(parsed.args.quantity), grossAmount: parsed.args.grossAmount.toString(), txHash: log.transactionHash || null };
  } catch { return null; }
}
export function verifyBaitPurchaseReceipt({ receipt, baitStoreAddress, expectedBuyer }) {
  if (!receipt || receipt.status !== '0x1') return { ok: false, reason: 'Transaction failed or missing' };
  const store = getAddress(baitStoreAddress);
  const buyer = getAddress(expectedBuyer);
  for (const log of receipt.logs || []) {
    if (getAddress(log.address) !== store) continue;
    const purchase = decodeBaitPurchaseLog(log);
    if (!purchase) continue;
    if (purchase.buyer !== buyer) return { ok: false, reason: 'Purchase buyer mismatch' };
    return { ok: true, purchase };
  }
  return { ok: false, reason: 'BaitPackPurchased event not found' };
}
