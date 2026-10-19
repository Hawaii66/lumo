import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "purge expired chats",
  { minutes: 5 },
  internal.threads.purgeExpired,
);

export default crons;
