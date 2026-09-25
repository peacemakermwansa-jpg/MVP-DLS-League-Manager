import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  addTeam,
  createLeague,
  generateFixtures,
  getLeagueDashboard,
  listLeagues,
  recordResult,
  removeTeam,
  updateTeam,
} from "./league";

const leagueIdInput = z.object({ leagueId: z.number().int().positive() });
const teamDetails = z.object({
  name: z.string().trim().min(2).max(120),
  managerName: z.string().trim().min(2).max(120),
  logoUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
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
    overview: publicProcedure.query(() => listLeagues()),
    dashboard: publicProcedure.input(leagueIdInput).query(({ input }) => getLeagueDashboard(input.leagueId)),
    create: publicProcedure.input(z.object({
      name: z.string().trim().min(2).max(120),
      seasonName: z.string().trim().min(2).max(120),
      numberOfTeams: z.number().int().min(2).max(32),
    })).mutation(({ input }) => createLeague(input)),
    addTeam: publicProcedure.input(leagueIdInput.merge(teamDetails)).mutation(({ input }) => addTeam(input)),
    updateTeam: publicProcedure.input(teamDetails.extend({ teamId: z.number().int().positive() })).mutation(({ input }) => updateTeam(input)),
    removeTeam: publicProcedure.input(z.object({ teamId: z.number().int().positive() })).mutation(({ input }) => removeTeam(input.teamId)),
    generateFixtures: publicProcedure.input(leagueIdInput).mutation(({ input }) => generateFixtures(input.leagueId)),
    recordResult: publicProcedure.input(z.object({
      fixtureId: z.number().int().positive(),
      homeScore: z.number().int().min(0).max(99),
      awayScore: z.number().int().min(0).max(99),
    })).mutation(({ input }) => recordResult(input)),
  }),
});

export type AppRouter = typeof appRouter;
