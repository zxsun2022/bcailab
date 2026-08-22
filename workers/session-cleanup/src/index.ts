import { deleteExpiredSessions } from "../../../packages/db/src/sessions";

type Env = {
  DB: D1Database;
};

const CLEANUP_BATCH_SIZE = 100;

export default {
  async scheduled(controller, env): Promise<void> {
    const webDeleted = await deleteExpiredSessions(env.DB, {
      nowMs: controller.scheduledTime,
      limit: CLEANUP_BATCH_SIZE
    });
    const [mapdownSessions, handoffs] = await env.DB.batch([
      env.DB.prepare(`
        DELETE FROM mapdown_sessions
        WHERE token_hash IN (
          SELECT token_hash FROM mapdown_sessions
          WHERE expires_at < ?
          ORDER BY expires_at ASC
          LIMIT ?
        )
      `).bind(controller.scheduledTime, CLEANUP_BATCH_SIZE),
      env.DB.prepare(`
        DELETE FROM mapdown_handoff_nonces
        WHERE nonce_hash IN (
          SELECT nonce_hash FROM mapdown_handoff_nonces
          WHERE expires_at < ?
          ORDER BY expires_at ASC
          LIMIT ?
        )
      `).bind(controller.scheduledTime, CLEANUP_BATCH_SIZE)
    ]);
    console.log(JSON.stringify({
      event: "expired_session_cleanup",
      webSessions: webDeleted,
      mapdownSessions: Number(mapdownSessions.meta.changes),
      mapdownHandoffs: Number(handoffs.meta.changes)
    }));
  }
} satisfies ExportedHandler<Env>;
