import { deleteExpiredSessions } from "../../../packages/db/src/sessions";

type Env = {
  DB: D1Database;
};

const CLEANUP_BATCH_SIZE = 100;

export default {
  async scheduled(controller, env): Promise<void> {
    const deleted = await deleteExpiredSessions(env.DB, {
      nowMs: controller.scheduledTime,
      limit: CLEANUP_BATCH_SIZE
    });
    console.log(`Expired session cleanup deleted ${deleted} row(s).`);
  }
} satisfies ExportedHandler<Env>;
