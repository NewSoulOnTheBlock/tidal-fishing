// Leaderboard API - Vercel KV backed global leaderboard
// POST /api/leaderboard - submit a catch
// GET /api/leaderboard - fetch top catches

import { kv } from "@vercel/kv";

export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  const { method } = req;

  // CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (method === "OPTIONS") {
    return new Response(null, { status: 200, headers });
  }

  try {
    if (method === "POST") {
      // Submit a catch to leaderboard
      const body = await req.json();
      const { wallet, species, sizeCm, weightKg, value, timestamp } = body;

      if (!wallet || !species || !sizeCm || !value) {
        return new Response(
          JSON.stringify({ error: "Missing required fields" }),
          { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
        );
      }

      // Store in sorted set by species (biggest catch)
      const speciesKey = `leaderboard:species:${species}`;
      await kv.zadd(speciesKey, {
        score: sizeCm,
        member: JSON.stringify({ wallet, sizeCm, weightKg, value, timestamp }),
      });

      // Store in sorted set by total earnings
      const earningsKey = "leaderboard:earnings";
      await kv.zincrby(earningsKey, value, wallet);

      // Store recent catches (last 50)
      const recentKey = "leaderboard:recent";
      await kv.lpush(recentKey, JSON.stringify({ wallet, species, sizeCm, value, timestamp }));
      await kv.ltrim(recentKey, 0, 49); // Keep only last 50

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    if (method === "GET") {
      const url = new URL(req.url);
      const type = url.searchParams.get("type") || "earnings"; // earnings | species | recent
      const species = url.searchParams.get("species");
      const limit = parseInt(url.searchParams.get("limit") || "10");

      if (type === "species" && species) {
        // Get top catches for specific species
        const speciesKey = `leaderboard:species:${species}`;
        const results = await kv.zrange(speciesKey, 0, limit - 1, { rev: true });
        const catches = results.map(r => JSON.parse(r));
        
        return new Response(
          JSON.stringify({ type: "species", species, catches }),
          { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
        );
      }

      if (type === "recent") {
        // Get recent catches
        const recentKey = "leaderboard:recent";
        const results = await kv.lrange(recentKey, 0, limit - 1);
        const catches = results.map(r => JSON.parse(r));

        return new Response(
          JSON.stringify({ type: "recent", catches }),
          { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
        );
      }

      // Default: top earners
      const earningsKey = "leaderboard:earnings";
      const results = await kv.zrange(earningsKey, 0, limit - 1, { rev: true, withScores: true });
      
      const leaderboard = [];
      for (let i = 0; i < results.length; i += 2) {
        leaderboard.push({
          wallet: results[i],
          totalEarnings: results[i + 1],
        });
      }

      return new Response(
        JSON.stringify({ type: "earnings", leaderboard }),
        { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...headers, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Leaderboard API error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }
}
