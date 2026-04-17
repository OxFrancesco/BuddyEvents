import type { PageServerLoad } from "./$types";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "$lib/server/services/convex";

export const load: PageServerLoad = async () => {
  const convex = getConvexClient();

  return {
    activeEvents: await convex.query(api.events.list, { status: "active" }),
  };
};
