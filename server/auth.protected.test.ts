import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function unauthenticatedContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("protected league procedures", () => {
  it("rejects unauthenticated overview, dashboard, and create requests", async () => {
    const caller = appRouter.createCaller(unauthenticatedContext());
    await expect(caller.league.overview()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.league.dashboard({ leagueId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.league.create({ name: "Private League", seasonName: "Season 1", numberOfTeams: 2 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
