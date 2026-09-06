import { utcRangeForYmdInTimeZone } from "./tz";

describe("utcRangeForYmdInTimeZone", () => {
  it("converts a Toronto local calendar day to UTC boundaries", () => {
    expect(
      utcRangeForYmdInTimeZone("2026-09-03", "America/Toronto"),
    ).toEqual({
      createdAtGte: "2026-09-03T04:00:00.000Z",
      createdAtLt: "2026-09-04T04:00:00.000Z",
    });
  });

  it("respects daylight-saving transitions instead of assuming a 24-hour UTC offset", () => {
    expect(
      utcRangeForYmdInTimeZone("2026-11-01", "America/Toronto"),
    ).toEqual({
      createdAtGte: "2026-11-01T04:00:00.000Z",
      createdAtLt: "2026-11-02T05:00:00.000Z",
    });
  });
});
