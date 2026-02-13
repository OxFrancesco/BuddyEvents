/// convex/events.ts — Event CRUD + moderation flows

import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireAdmin, requireSignedInUser } from "./lib/auth";

const eventStatusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("ended"),
  v.literal("cancelled"),
);

const submissionSourceValidator = v.union(
  v.literal("foundation_admin"),
  v.literal("project_admin"),
  v.literal("user_submission"),
);

const moderationStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
);

const eventValidator = v.object({
  _id: v.id("events"),
  _creationTime: v.number(),
  name: v.string(),
  description: v.string(),
  startTime: v.number(),
  endTime: v.number(),
  price: v.number(),
  maxTickets: v.number(),
  ticketsSold: v.number(),
  teamId: v.optional(v.id("teams")),
  projectId: v.optional(v.id("projects")),
  sponsors: v.array(v.id("sponsors")),
  location: v.string(),
  onChainEventId: v.optional(v.number()),
  contractAddress: v.optional(v.string()),
  creatorAddress: v.string(),
  status: eventStatusValidator,
  submissionSource: v.optional(submissionSourceValidator),
  moderationStatus: v.optional(moderationStatusValidator),
  moderationNotes: v.optional(v.string()),
  reviewedByUserId: v.optional(v.id("users")),
  reviewedAt: v.optional(v.number()),
});

function effectiveModerationStatus(event: Doc<"events">) {
  return event.moderationStatus ?? "approved";
}

// ========== Queries ==========

export const list = query({
  args: {
    status: v.optional(eventStatusValidator),
    moderationStatus: v.optional(moderationStatusValidator),
  },
  returns: v.array(eventValidator),
  handler: async (ctx, args) => {
    const events = args.status
      ? await ctx.db
          .query("events")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order("desc")
          .collect()
      : await ctx.db.query("events").order("desc").collect();

    if (!args.moderationStatus) return events;
    return events.filter(
      (event) => effectiveModerationStatus(event) === args.moderationStatus,
    );
  },
});

export const get = query({
  args: { id: v.id("events") },
  returns: v.union(eventValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

const sectionEventValidator = v.object({
  _id: v.id("events"),
  _creationTime: v.number(),
  name: v.string(),
  description: v.string(),
  startTime: v.number(),
  endTime: v.number(),
  price: v.number(),
  maxTickets: v.number(),
  ticketsSold: v.number(),
  teamId: v.optional(v.id("teams")),
  projectId: v.optional(v.id("projects")),
  location: v.string(),
  creatorAddress: v.string(),
  status: eventStatusValidator,
  moderationStatus: moderationStatusValidator,
  foundationName: v.optional(v.string()),
  projectName: v.optional(v.string()),
});

export const listEventsPageSections = query({
  args: {},
  returns: v.object({
    foundationEvents: v.array(sectionEventValidator),
    projectEvents: v.array(sectionEventValidator),
  }),
  handler: async (ctx) => {
    const [events, foundations, projects] = await Promise.all([
      ctx.db.query("events").order("desc").collect(),
      ctx.db.query("teams").collect(),
      ctx.db.query("projects").collect(),
    ]);

    const foundationMap = new Map(foundations.map((item) => [item._id, item]));
    const projectMap = new Map(projects.map((item) => [item._id, item]));

    const foundationEvents: Array<
      {
        _id: Doc<"events">["_id"];
        _creationTime: number;
        name: string;
        description: string;
        startTime: number;
        endTime: number;
        price: number;
        maxTickets: number;
        ticketsSold: number;
        teamId: Doc<"events">["teamId"];
        projectId: Doc<"events">["projectId"];
        location: string;
        creatorAddress: string;
        status: Doc<"events">["status"];
        moderationStatus: "pending" | "approved" | "rejected";
        foundationName?: string;
        projectName?: string;
      }
    > = [];
    const projectEvents: typeof foundationEvents = [];

    for (const event of events) {
      if (effectiveModerationStatus(event) !== "approved") continue;

      const project = event.projectId ? projectMap.get(event.projectId) : undefined;
      const foundationId = project?.foundationId ?? event.teamId;
      const foundation = foundationId ? foundationMap.get(foundationId) : undefined;

      const item = {
        _id: event._id,
        _creationTime: event._creationTime,
        name: event.name,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        price: event.price,
        maxTickets: event.maxTickets,
        ticketsSold: event.ticketsSold,
        teamId: foundationId,
        projectId: project?._id,
        location: event.location,
        creatorAddress: event.creatorAddress,
        status: event.status,
        moderationStatus: "approved" as const,
        foundationName: foundation?.name,
        projectName: project?.name,
      };

      if (project) projectEvents.push(item);
      else foundationEvents.push(item);
    }

    return { foundationEvents, projectEvents };
  },
});

export const listPendingSubmissions = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("events"),
      _creationTime: v.number(),
      name: v.string(),
      description: v.string(),
      startTime: v.number(),
      endTime: v.number(),
      price: v.number(),
      maxTickets: v.number(),
      ticketsSold: v.number(),
      teamId: v.optional(v.id("teams")),
      projectId: v.optional(v.id("projects")),
      location: v.string(),
      creatorAddress: v.string(),
      status: eventStatusValidator,
      moderationStatus: moderationStatusValidator,
      submissionSource: v.optional(submissionSourceValidator),
      foundationName: v.optional(v.string()),
      projectName: v.optional(v.string()),
      submitterEmail: v.optional(v.string()),
      submitterRole: v.optional(v.union(v.literal("user"), v.literal("admin"))),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const [events, foundations, projects, users] = await Promise.all([
      ctx.db
        .query("events")
        .withIndex("by_moderation_status", (q) => q.eq("moderationStatus", "pending"))
        .order("desc")
        .collect(),
      ctx.db.query("teams").collect(),
      ctx.db.query("projects").collect(),
      ctx.db.query("users").collect(),
    ]);

    const foundationMap = new Map(foundations.map((item) => [item._id, item]));
    const projectMap = new Map(projects.map((item) => [item._id, item]));
    const userByWallet = new Map(
      users
        .filter((user) => !!user.walletAddress)
        .map((user) => [user.walletAddress!, user]),
    );

    return events.map((event) => {
      const project = event.projectId ? projectMap.get(event.projectId) : undefined;
      const foundationId = project?.foundationId ?? event.teamId;
      const foundation = foundationId ? foundationMap.get(foundationId) : undefined;
      const submitter = userByWallet.get(event.creatorAddress);

      return {
        _id: event._id,
        _creationTime: event._creationTime,
        name: event.name,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        price: event.price,
        maxTickets: event.maxTickets,
        ticketsSold: event.ticketsSold,
        teamId: foundationId,
        projectId: project?._id,
        location: event.location,
        creatorAddress: event.creatorAddress,
        status: event.status,
        moderationStatus: effectiveModerationStatus(event),
        submissionSource: event.submissionSource,
        foundationName: foundation?.name,
        projectName: project?.name,
        submitterEmail: submitter?.email,
        submitterRole: submitter?.role,
      };
    });
  },
});

// ========== Mutations ==========

export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    price: v.number(),
    maxTickets: v.number(),
    teamId: v.id("teams"),
    sponsors: v.optional(v.array(v.id("sponsors"))),
    location: v.string(),
    creatorAddress: v.string(),
  },
  returns: v.id("events"),
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");

    return await ctx.db.insert("events", {
      name: args.name,
      description: args.description,
      startTime: args.startTime,
      endTime: args.endTime,
      price: args.price,
      maxTickets: args.maxTickets,
      ticketsSold: 0,
      teamId: args.teamId,
      sponsors: args.sponsors ?? [],
      location: args.location,
      creatorAddress: args.creatorAddress,
      status: "active" as const,
      submissionSource: "foundation_admin" as const,
      moderationStatus: "approved" as const,
    });
  },
});

export const submit = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    price: v.number(),
    maxTickets: v.number(),
    foundationId: v.optional(v.id("teams")),
    projectId: v.optional(v.id("projects")),
    sponsors: v.optional(v.array(v.id("sponsors"))),
    location: v.string(),
    creatorAddress: v.string(),
  },
  returns: v.id("events"),
  handler: async (ctx, args) => {
    const submitter = await requireSignedInUser(ctx);

    let foundationId = args.foundationId;
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project) throw new Error("Project not found");
      if (foundationId && project.foundationId !== foundationId) {
        throw new Error("Project does not belong to selected foundation");
      }
      foundationId = project.foundationId;
    }

    if (foundationId) {
      const foundation = await ctx.db.get(foundationId);
      if (!foundation) throw new Error("Foundation not found");
    }

    const isAdmin = submitter.role === "admin";
    const hasAssignment = foundationId !== undefined || args.projectId !== undefined;
    const autoApprove = isAdmin && hasAssignment;

    return await ctx.db.insert("events", {
      name: args.name,
      description: args.description,
      startTime: args.startTime,
      endTime: args.endTime,
      price: args.price,
      maxTickets: args.maxTickets,
      ticketsSold: 0,
      teamId: foundationId,
      projectId: args.projectId,
      sponsors: args.sponsors ?? [],
      location: args.location,
      creatorAddress: args.creatorAddress,
      status: autoApprove ? ("active" as const) : ("draft" as const),
      submissionSource: autoApprove
        ? args.projectId
          ? ("project_admin" as const)
          : ("foundation_admin" as const)
        : ("user_submission" as const),
      moderationStatus: autoApprove
        ? ("approved" as const)
        : ("pending" as const),
      reviewedByUserId: autoApprove ? submitter._id : undefined,
      reviewedAt: autoApprove ? Date.now() : undefined,
    });
  },
});

export const approveSubmission = mutation({
  args: {
    id: v.id("events"),
    foundationId: v.optional(v.id("teams")),
    projectId: v.optional(v.id("projects")),
    moderationNotes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const event = await ctx.db.get(args.id);
    if (!event) throw new Error("Event not found");
    if (effectiveModerationStatus(event) !== "pending") {
      throw new Error("Only pending submissions can be approved");
    }

    const projectId = args.projectId ?? event.projectId;
    let foundationId = args.foundationId ?? event.teamId;

    if (projectId) {
      const project = await ctx.db.get(projectId);
      if (!project) throw new Error("Project not found");
      foundationId = project.foundationId;
    }

    if (!foundationId) {
      throw new Error("Approval requires assignment to a foundation or project");
    }
    const foundation = await ctx.db.get(foundationId);
    if (!foundation) throw new Error("Foundation not found");

    const patch: Partial<Doc<"events">> = {
      teamId: foundationId,
      projectId,
      status: "active",
      moderationStatus: "approved",
      reviewedByUserId: admin._id,
      reviewedAt: Date.now(),
    };
    if (args.moderationNotes !== undefined) {
      patch.moderationNotes = args.moderationNotes;
    }

    await ctx.db.patch(args.id, patch);
    return null;
  },
});

export const rejectSubmission = mutation({
  args: {
    id: v.id("events"),
    moderationNotes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const event = await ctx.db.get(args.id);
    if (!event) throw new Error("Event not found");
    if (effectiveModerationStatus(event) !== "pending") {
      throw new Error("Only pending submissions can be rejected");
    }

    const patch: Partial<Doc<"events">> = {
      moderationStatus: "rejected",
      status: "cancelled",
      reviewedByUserId: admin._id,
      reviewedAt: Date.now(),
    };
    if (args.moderationNotes !== undefined) {
      patch.moderationNotes = args.moderationNotes;
    }

    await ctx.db.patch(args.id, patch);
    return null;
  },
});

export const edit = mutation({
  args: {
    id: v.id("events"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    price: v.optional(v.number()),
    location: v.optional(v.string()),
    sponsors: v.optional(v.array(v.id("sponsors"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.id);
    if (!event) throw new Error("Event not found");

    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.description !== undefined) patch.description = args.description;
    if (args.startTime !== undefined) patch.startTime = args.startTime;
    if (args.endTime !== undefined) patch.endTime = args.endTime;
    if (args.price !== undefined) patch.price = args.price;
    if (args.location !== undefined) patch.location = args.location;
    if (args.sponsors !== undefined) patch.sponsors = args.sponsors;

    await ctx.db.patch(args.id, patch);
    return null;
  },
});

export const cancel = mutation({
  args: { id: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.id);
    if (!event) throw new Error("Event not found");

    await ctx.db.patch(args.id, { status: "cancelled" as const });
    return null;
  },
});

// Internal mutation for setting on-chain data after deployment
export const setOnChainData = internalMutation({
  args: {
    id: v.id("events"),
    onChainEventId: v.number(),
    contractAddress: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      onChainEventId: args.onChainEventId,
      contractAddress: args.contractAddress,
    });
    return null;
  },
});
