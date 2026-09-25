import { describe, expect, it } from "vitest";
import { fixtures, teams } from "../drizzle/schema";
import { calculateStandings, generateRoundRobinFixtures } from "./league";

type TeamRow = typeof teams.$inferSelect;
type FixtureRow = typeof fixtures.$inferSelect;

function team(id: number, name: string): TeamRow {
  return {
    id,
    leagueId: 1,
    name,
    managerName: `${name} manager`,
    logoUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function fixture(overrides: Partial<FixtureRow>): FixtureRow {
  return {
    id: 1,
    leagueId: 1,
    round: 1,
    homeTeamId: 1,
    awayTeamId: 2,
    status: "pending",
    homeScore: null,
    awayScore: null,
    playedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("generateRoundRobinFixtures", () => {
  it("creates one home-and-away fixture for every pair", () => {
    const schedule = generateRoundRobinFixtures([1, 2, 3, 4]);
    expect(schedule).toHaveLength(12);

    const pairCounts = new Map<string, number>();
    for (const match of schedule) {
      const pair = [match.homeTeamId, match.awayTeamId].sort((a, b) => a - b).join("-");
      pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
    }
    expect(pairCounts.size).toBe(6);
    expect([...pairCounts.values()].every((count) => count === 2)).toBe(true);
  });

  it("handles an odd number of teams with a bye", () => {
    const schedule = generateRoundRobinFixtures([1, 2, 3]);
    expect(schedule).toHaveLength(6);
    expect(new Set(schedule.map((match) => match.round))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });
});

describe("calculateStandings", () => {
  it("uses 3/1/0 scoring and sorts by points, goal difference, then goals for", () => {
    const rows = calculateStandings(
      [team(1, "Alpha"), team(2, "Bravo"), team(3, "Charlie")],
      [
        fixture({ id: 1, homeTeamId: 1, awayTeamId: 2, status: "completed", homeScore: 2, awayScore: 0 }),
        fixture({ id: 2, homeTeamId: 2, awayTeamId: 3, status: "completed", homeScore: 1, awayScore: 1 }),
        fixture({ id: 3, homeTeamId: 3, awayTeamId: 1, status: "completed", homeScore: 4, awayScore: 2 }),
        fixture({ id: 4, homeTeamId: 1, awayTeamId: 3, status: "pending", homeScore: null, awayScore: null }),
      ]
    );

    expect(rows.map((row) => row.teamName)).toEqual(["Charlie", "Alpha", "Bravo"]);
    expect(rows[0]).toMatchObject({ played: 2, wins: 1, draws: 1, losses: 0, goalsFor: 5, goalsAgainst: 3, goalDifference: 2, points: 4 });
    expect(rows[1]).toMatchObject({ played: 2, wins: 1, draws: 0, losses: 1, points: 3 });
    expect(rows[2]).toMatchObject({ played: 2, wins: 0, draws: 1, losses: 1, points: 1 });
  });
});
