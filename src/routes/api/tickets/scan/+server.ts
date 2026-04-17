import { json, type RequestHandler } from "@sveltejs/kit";
import { api } from "@/convex/_generated/api";
import {
  listOwnedAddressesForUser,
  userOwnsAddress,
} from "@/lib/walletOwnership";
import {
  getConvexClient,
  getConvexServiceToken,
  getUserByClerkId,
} from "$lib/server/services/convex";

export const POST: RequestHandler = async (event) => {
  try {
    const clerkUserId = event.locals.clerk.userId;
    if (!clerkUserId) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await event.request.json();
    const qrCode = typeof body.qrCode === "string" ? body.qrCode.trim() : "";
    const requestedOrganizerAddress =
      typeof body.organizerAddress === "string"
        ? body.organizerAddress.trim()
        : "";

    if (!qrCode) {
      return json({ error: "qrCode is required" }, { status: 400 });
    }

    const convex = getConvexClient();
    const serviceToken = getConvexServiceToken();
    const user = await getUserByClerkId(clerkUserId);
    if (!user) {
      return json({ error: "User profile not found" }, { status: 404 });
    }

    if (
      user.role !== "admin" &&
      requestedOrganizerAddress &&
      !(await userOwnsAddress({
        convex,
        user,
        address: requestedOrganizerAddress,
        serviceToken,
      }))
    ) {
      return json({ error: "Forbidden" }, { status: 403 });
    }

    const ownedAddresses =
      user.role === "admin"
        ? []
        : await listOwnedAddressesForUser({ convex, user, serviceToken });

    const result = await convex.mutation(api.tickets.scanForCheckIn, {
      qrCode,
      organizerAddress: requestedOrganizerAddress || ownedAddresses[0],
      serviceToken,
    });

    return json(result, { status: 200 });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Scan failed" },
      { status: 500 },
    );
  }
};
