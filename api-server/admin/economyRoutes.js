export function installEconomyAdminRoutes(app, { pool = null, adminSecret = process.env.ADMIN_SECRET || '' } = {}) {
  app.get('/api/admin/economy', async (req, res) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (adminSecret && token !== adminSecret) return res.status(403).json({ error: 'Admin secret required' });
    const empty = {
      baitSalesGross: 0,
      operatorRevenue: 0,
      rewardPoolFunded: 0,
      rewardsEarned: 0,
      rewardsClaimed: 0,
      pendingLiabilities: 0,
      actualHouseEdgeBps: null,
      topSpenders: [],
      suspiciousWallets: [],
      jackpotExposure: 0,
    };
    if (!pool) return res.json(empty);
    try {
      const [purchases, earned, claims, topSpenders, suspicious] = await Promise.all([
        pool.query("SELECT COALESCE(SUM(gross_amount::numeric),0) gross FROM onchain_purchases WHERE kind='bait'"),
        pool.query('SELECT COALESCE(SUM(value_ui),0) earned FROM catches'),
        pool.query("SELECT COALESCE(SUM(amount_ui),0) FILTER (WHERE status IN ('pending','submitted')) pending, COALESCE(SUM(amount_ui),0) FILTER (WHERE status IN ('claimed','confirmed','submitted')) claimed FROM reward_claims"),
        pool.query("SELECT wallet_address, COUNT(*) purchases, COALESCE(SUM(gross_amount::numeric),0) gross FROM onchain_purchases WHERE kind='bait' GROUP BY wallet_address ORDER BY gross DESC LIMIT 10"),
        pool.query("SELECT wallet_address, COUNT(*) catches, COALESCE(SUM(value_ui),0) earned FROM catches GROUP BY wallet_address HAVING COUNT(*) > 100 OR COALESCE(SUM(value_ui),0) > 1000 ORDER BY earned DESC LIMIT 20"),
      ]);
      const baitSalesRaw = Number(purchases.rows[0]?.gross || 0);
      const baitSalesUi = baitSalesRaw / 1e18;
      const rewardsEarned = Number(earned.rows[0]?.earned || 0);
      const pendingLiabilities = Number(claims.rows[0]?.pending || 0);
      const rewardsClaimed = Number(claims.rows[0]?.claimed || 0);
      const operatorRevenue = baitSalesUi * 0.25;
      Object.assign(empty, {
        baitSalesGross: baitSalesUi,
        operatorRevenue,
        rewardPoolFunded: baitSalesUi * 0.65,
        rewardsEarned,
        rewardsClaimed,
        pendingLiabilities,
        actualHouseEdgeBps: baitSalesUi > 0 ? Math.round(((baitSalesUi - rewardsEarned) / baitSalesUi) * 10000) : null,
        topSpenders: topSpenders.rows.map((r) => ({ walletAddress: r.wallet_address, purchases: Number(r.purchases), gross: Number(r.gross) / 1e18 })),
        suspiciousWallets: suspicious.rows.map((r) => ({ walletAddress: r.wallet_address, catches: Number(r.catches), earned: Number(r.earned) })),
        jackpotExposure: pendingLiabilities,
      });
    } catch (error) {
      return res.status(500).json({ ...empty, error: error.message });
    }
    res.json(empty);
  });
}
