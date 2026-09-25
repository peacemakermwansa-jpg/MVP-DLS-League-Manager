import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  addTeam,
  createLeague,
  deleteLeague,
  generateFixtures,
  getLeagueDashboard,
  listLeagues,
  recordResult,
  removeTeam,
  updateLeague,
  updateTeam,
} from "./league";

const leagueIdInput = z.object({ leagueId: z.number().int().positive() });
const teamDetails = z.object({
  name: z.string().trim().min(2).max(120),
  managerName: z.string().trim().min(2).max(120),
  logoUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
});
const leagueDetails = z.object({
  name: z.string().trim().min(2).max(120),
  seasonName: z.string().trim().min(2).max(120),
  numberOfTeams: z.number().int().min(2).max(32),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
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
    recordResult: protectedProcedure.input(z.object({
      fixtureId: z.number().int().positive(),
      homeScore: z.number().int().min(0).max(99),
      awayScore: z.number().int().min(0).max(99),
    })).mutation(({ ctx, input }) => recordResult({ ...input, userId: ctx.user.id })),
  }),
});

export type AppRouter = typeof appRouter;
