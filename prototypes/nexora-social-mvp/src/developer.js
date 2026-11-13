const express = require("express");

const PERMISSIONS = new Set([
  "players.view", "players.ban", "players.unban", "world.view", "world.manage",
  "economy.view", "economy.manage", "items.view", "items.manage", "system.view",
  "roles.manage", "logs.view"
]);
function ownerId() {
  const value = String(process.env.NEXORA_OWNER_ACCOUNT_ID || "").trim();
  return /^\d+$/.test(value) ? value : "";
}
function createDeveloperRouter({ pool, auth, players, planets }) {
  const router = express.Router();
  const requestTimes = new Map();
  async function context(req) {
    const account = await auth.authenticateToken(req.cookies?.nexora_session);
    if (!account) return null;
    if (ownerId() && String(account.id) === ownerId()) return { account, role: "OWNER", permissions: [...PERMISSIONS] };
    const result = await pool.query("SELECT role, permissions FROM nexora_social_world.developer_role_assignments WHERE account_id=$1", [account.id]);
    const assignment = result.rows[0];
    if (!assignment) return { account, role: "USER", permissions: [] };
    const permissions = Array.isArray(assignment.permissions) ? assignment.permissions.filter(p => PERMISSIONS.has(p)) : [];
    return { account, role: assignment.role, permissions };
  }
  async function requirePermission(req, res, permission) {
    const current = await context(req);
    if (!current) { res.status(401).json({ error: "Требуется вход." }); return null; }
    if (!current.permissions.includes(permission)) { res.status(403).json({ error: "Недостаточно прав." }); return null; }
    const key = String(current.account.id), now = Date.now();
    const recent = (requestTimes.get(key) || []).filter(time => now - time < 60000);
    if (recent.length >= 60) { res.status(429).json({ error: "Слишком много запросов. Повторите позже." }); return null; }
    recent.push(now); requestTimes.set(key, recent);
    return current;
  }
  router.get("/access", async (req, res, next) => {
    try {
      const current = await context(req);
      if (!current) return res.status(401).json({ error: "Требуется вход." });
      res.json({ ok: true, allowed: current.role === "OWNER" || current.permissions.length > 0, role: current.role, permissions: current.permissions });
    } catch (error) { next(error); }
  });
  router.get("/overview", async (req, res, next) => {
    try {
      const current = await requirePermission(req, res, "system.view"); if (!current) return;
      const counts = await pool.query("SELECT (SELECT COUNT(*)::int FROM nexora_social_world.accounts) AS accounts, (SELECT COUNT(*)::int FROM nexora_social_world.characters) AS characters");
      const active = new Set([...players.values()].map(player => player.planet));
      res.json({ ok: true, role: current.role, server: "online", database: "connected", onlinePlayers: players.size, accounts: counts.rows[0].accounts, characters: counts.rows[0].characters, activeRooms: active.size });
    } catch (error) { next(error); }
  });
  router.get("/players", async (req, res, next) => {
    try {
      const current = await requirePermission(req, res, "players.view"); if (!current) return;
      const query = String(req.query.q || "").trim().slice(0, 18);
      const result = await pool.query(
        `SELECT a.id,a.nickname,a.created_at,COALESCE(c.planet,'unknown') AS planet
           FROM nexora_social_world.accounts a LEFT JOIN nexora_social_world.characters c ON c.account_id=a.id
          WHERE ($1='' OR a.nickname ILIKE $2 OR a.id::text=$1)
          ORDER BY a.created_at DESC LIMIT 50`,
        [query, "%" + query.replace(/[\\%_]/g, "\\$&") + "%"]
      );
      const online = new Set([...players.values()].map(player => String(player.accountId)));
      res.json({ ok: true, players: result.rows.map(p => ({ id: String(p.id), nickname: p.nickname, planet: p.planet, createdAt: p.created_at, online: online.has(String(p.id)) })) });
    } catch (error) { next(error); }
  });
  router.get("/world", async (req, res, next) => {
    try {
      const current = await requirePermission(req, res, "world.view"); if (!current) return;
      const counts = {}; for (const player of players.values()) counts[player.planet] = (counts[player.planet] || 0) + 1;
      const roomCount = await pool.query("SELECT COUNT(*)::int AS count FROM nexora_social_world.rooms");
      const world = Object.entries(planets).map(([slug, planet]) => ({ slug, title: planet.name, online: counts[slug] || 0, rooms: slug === "starter" ? roomCount.rows[0].count : 0 }));
      res.json({ ok: true, world });
    } catch (error) { next(error); }
  });
  router.get("/audit", async (req, res, next) => {
    try {
      const current = await requirePermission(req, res, "logs.view"); if (!current) return;
      const result = await pool.query(
        `SELECT l.action,l.reason,l.created_at,COALESCE(a.nickname,'Системный пользователь') AS actor_nickname
           FROM nexora_social_world.developer_audit_logs l LEFT JOIN nexora_social_world.accounts a ON a.id=l.actor_account_id
          ORDER BY l.created_at DESC LIMIT 50`
      );
      res.json({ ok: true, entries: result.rows.map(e => ({ action: e.action, reason: e.reason, actorNickname: e.actor_nickname, createdAt: e.created_at })) });
    } catch (error) { next(error); }
  });
  router.get("/roles", async (req, res, next) => {
    try {
      const current = await requirePermission(req, res, "roles.manage"); if (!current) return;
      const result = await pool.query(`SELECT r.account_id AS id,a.nickname,r.role,r.permissions,r.updated_at FROM nexora_social_world.developer_role_assignments r JOIN nexora_social_world.accounts a ON a.id=r.account_id ORDER BY r.updated_at DESC LIMIT 100`);
      res.json({ ok: true, assignments: result.rows });
    } catch (error) { next(error); }
  });
  router.post("/roles", async (req, res, next) => {
    try {
      const current = await requirePermission(req, res, "roles.manage"); if (!current) return;
      if (current.role !== "OWNER") return res.status(403).json({ error: "Назначать роли может только владелец." });
      const accountId = String(req.body?.accountId || "").trim();
      const role = String(req.body?.role || "").trim().toUpperCase();
      const reason = String(req.body?.reason || "").trim().slice(0, 500);
      const permissions = Array.isArray(req.body?.permissions) ? [...new Set(req.body.permissions.filter(p => PERMISSIONS.has(p)))] : [];
      if (!/^\d+$/.test(accountId) || !["DEVELOPER","MODERATOR","HELPER","USER"].includes(role)) return res.status(400).json({ error: "Некорректный аккаунт или роль." });
      if (ownerId() && accountId === ownerId()) return res.status(400).json({ error: "Нельзя изменить роль владельца через назначения." });
      const target = await pool.query("SELECT id FROM nexora_social_world.accounts WHERE id=$1", [accountId]);
      if (!target.rowCount) return res.status(404).json({ error: "Аккаунт не найден." });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (role === "USER") await client.query("DELETE FROM nexora_social_world.developer_role_assignments WHERE account_id=$1", [accountId]);
        else await client.query(
          `INSERT INTO nexora_social_world.developer_role_assignments(account_id,role,permissions,assigned_by)
           VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(account_id) DO UPDATE SET role=EXCLUDED.role,permissions=EXCLUDED.permissions,assigned_by=EXCLUDED.assigned_by,updated_at=NOW()`,
          [accountId, role, JSON.stringify(permissions), current.account.id]
        );
        await client.query("INSERT INTO nexora_social_world.developer_audit_logs(actor_account_id,target_account_id,action,reason,details) VALUES($1,$2,$3,$4,$5::jsonb)", [current.account.id, accountId, "role.assignment", reason || null, JSON.stringify({ role, permissions })]);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
      res.json({ ok: true, accountId, role, permissions });
    } catch (error) { next(error); }
  });
  return router;
}
module.exports = { createDeveloperRouter };
