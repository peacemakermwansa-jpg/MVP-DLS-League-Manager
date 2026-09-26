import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  addTeam, createLeague, deleteLeague, generateFixtures, getLeagueDashboard, listLeagues,
  recordResult, removeTeam, updateLeague, updateTeam,
} from "./league";
import {
  addPlayerByPlayerId, applyToLeague, findLeague, findPlayerByPlayerId, listLeaguePlayers, playerDashboard, playerProfile, removePlayer,
  reviewPlayer, teamPage, updateOwnProfile,
} from "./players";

const leagueIdInput = z.object({ leagueId: z.number().int().positive() });
const playerIdInput = z.object({ playerId: z.number().int().min(100000).max(999999) });
const teamDetails = z.object({ name: z.string().trim().min(2).max(120), managerName: z.string().trim().min(2).max(120), logoUrl: z.string().trim().url().max(500).optional().or(z.literal("")) });
const leagueDetails = z.object({ name: z.string().trim().min(2).max(120), seasonName: z.string().trim().min(2).max(120), numberOfTeams: z.number().int().min(2).max(32) });
const playerDetails = z.object({ playerName: z.string().trim().min(2).max(120), username: z.string().trim().min(2).max(64).regex(/^[a-zA-Z0-9_.-]+$/), profilePicture: z.string().trim().url().max(500).optional().or(z.literal("")), whatsappNumber: z.string().trim().max(32).optional().or(z.literal("")) });

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => { const cookieOptions = getSessionCookieOptions(ctx.req); ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 }); return { success: true } as const; }),
  }),
  league: router({
    overview: protectedProcedure.query(({ ctx }) => listLeagues(ctx.user.id)),
    dashboard: protectedProcedure.input(leagueIdInput).query(({ ctx, input }) => getLeagueDashboard(input.leagueId, ctx.user.id)),
    create: protectedProcedure.input(leagueDetails).mutation(({ ctx, input }) => createLeague({ ...input, userId: ctx.user.id })),
    update: protectedProcedure.input(leagueDetails.extend({ leagueId: z.number().int().positive() })).mutation(({ ctx, input }) => updateLeague({ ...input, userId: ctx.user.id })),
    delete: protectedProcedure.input(leagueIdInput).mutation(({ ctx, input }) => deleteLeague(input.leagueId, ctx.user.id)),
    addTeam: protectedProcedure.input(leagueIdInput.merge(teamDetails)).mutation(({ ctx, input }) => addTeam({ ...input, userId: ctx.user.id })),
    updateTeam: protectedProcedure.input(teamDetails.extend({ teamId: z.number().int().positive() })).mutation(({ ctx, input }) => updateTeam({ ...input, userId: ctx.user.id })),
    removeTeam: protectedProcedure.input(z.object({ teamId: z.number().int().positive() })).mutation(({ ctx, input }) => removeTeam(input.teamId, ctx.user.id)),
    generateFixtures: protectedProcedure.input(leagueIdInput).mutation(({ ctx, input }) => generateFixtures(input.leagueId, ctx.user.id)),
    recordResult: protectedProcedure.input(z.object({ fixtureId: z.number().int().positive(), homeScore: z.number().int().min(0).max(99), awayScore: z.number().int().min(0).max(99) })).mutation(({ ctx, input }) => recordResult({ ...input, userId: ctx.user.id })),
  }),
  player: router({
    profile: protectedProcedure.query(({ ctx }) => playerProfile(ctx.user.id)),
    dashboard: protectedProcedure.query(({ ctx }) => playerDashboard(ctx.user.id)),
    findLeague: protectedProcedure.input(leagueIdInput).query(({ input }) => findLeague(input.leagueId)),
    register: protectedProcedure.input(leagueIdInput.merge(playerDetails)).mutation(({ ctx, input }) => applyToLeague({ ...input, userId: ctx.user.id })),
    updateProfile: protectedProcedure.input(playerDetails.extend({ membershipId: z.number().int().positive() })).mutation(({ ctx, input }) => updateOwnProfile({ ...input, userId: ctx.user.id })),
    team: protectedProcedure.input(z.object({ teamId: z.number().int().positive() })).query(({ ctx, input }) => teamPage(input.teamId, ctx.user.id)),
  }),
  playerAdmin: router({
    list: protectedProcedure.input(leagueIdInput).query(({ ctx, input }) => listLeaguePlayers(input.leagueId, ctx.user.id)),
    findPlayer: protectedProcedure.input(playerIdInput).query(({ input }) => findPlayerByPlayerId(input.playerId)),
    add: protectedProcedure.input(leagueIdInput.merge(playerIdInput)).mutation(({ ctx, input }) => addPlayerByPlayerId({ ...input, userId: ctx.user.id })),
    review: protectedProcedure.input(z.object({ membershipId: z.number().int().positive(), registrationStatus: z.enum(["approved", "rejected"]), teamId: z.number().int().positive().nullable().optional() })).mutation(({ ctx, input }) => reviewPlayer({ ...input, userId: ctx.user.id })),
    remove: protectedProcedure.input(z.object({ membershipId: z.number().int().positive() })).mutation(({ ctx, input }) => removePlayer(input.membershipId, ctx.user.id)),
  }),
});
export type AppRouter = typeof appRouter;
