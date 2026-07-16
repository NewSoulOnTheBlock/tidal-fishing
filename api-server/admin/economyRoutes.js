export function installEconomyAdminRoutes(app, { pool = null, adminSecret = process.env.ADMIN_SECRET || '' } = {}) {
  app.get('/api/admin/economy', async (req, res) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (adminSecret && token !== adminSecret) return res.status(403).json({ error: 'Admin secret required' });
    const empty = { baitSalesGross: 0, operatorRevenue: 0, rewardPoolFunded: 0, rewardsEarned: 0, rewardsClaimed: 0, pendingLiabilities: 0, actualHouseEdgeBps: null, topSpenders: [], suspiciousWallets: [], jackpotExposure: 0 };
    if (!pool) return res.json(empty);
    try {
      const purchases = await pool.query("SELECT COALESCE(SUM(gross_amount::numeric),0) gross FROM onchain_purchases WHERE kind='bait'");
      empty.baitSalesGross = purchases.rows[0]?.gross || 0;
    } catch {}
    res.json(empty);
  });
}
