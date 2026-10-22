// Runs once when the Next.js server starts. Starts the automatic send
// schedule on the shop PC. Off in `next dev` unless SCHEDULER_ENABLED=true.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const enabled =
    process.env.SCHEDULER_ENABLED === "true" ||
    (process.env.NODE_ENV === "production" &&
      process.env.SCHEDULER_ENABLED !== "false");
  if (!enabled) return;
  const { startScheduler } = await import("./lib/schedule");
  startScheduler();
}
