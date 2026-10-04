import { parsePublicWebConfig } from "./public-web-config";

describe("parsePublicWebConfig", () => {
  it("accepts the browser-safe runtime config contract", () => {
    expect(
      parsePublicWebConfig({
        store: {
          storeStableId: "4750_Yonge_Street",
          latitude: 43.760288,
          longitude: -79.412167,
        },
        maps: {
          browserKey: "browser-key",
        },
      }),
    ).toEqual({
      store: {
        storeStableId: "4750_Yonge_Street",
        latitude: 43.760288,
        longitude: -79.412167,
      },
      maps: {
        browserKey: "browser-key",
      },
    });
  });

  it.each([
    null,
    {},
    {
      store: {
        storeStableId: "4750_Yonge_Street",
        latitude: null,
        longitude: -79.412167,
      },
      maps: { browserKey: "browser-key" },
    },
    {
      store: {
        storeStableId: "4750_Yonge_Street",
        latitude: 43.760288,
        longitude: -79.412167,
      },
      maps: { browserKey: "" },
    },
  ])("rejects invalid runtime config %#", (payload) => {
    expect(() => parsePublicWebConfig(payload)).toThrow(
      "Public web configuration is invalid.",
    );
  });
});
