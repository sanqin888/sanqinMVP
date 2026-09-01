import { ApiError } from "./client";
import {
  claimPosDevice,
  fetchPosHeartbeatSchedule,
  fetchPosSessionSnapshot,
  fetchPosStoreContext,
  loginPosSession,
  postPosConnectivityHeartbeat,
} from "./pos-session";

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json; charset=utf-8" }),
    json: jest.fn().mockResolvedValue(payload),
    text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
  } as unknown as Response;
}

describe("POS session API adapter", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it("claims a POS device and fixes the login purpose inside the adapter", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          code: "OK",
          message: "success",
          details: { success: true, deviceStableId: "pos_device_1" },
        }, 201),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: "OK",
          message: "success",
          details: { role: "STAFF" },
        }, 201),
      );

    const meta = {
      userAgent: "jest-agent",
      platform: "jest-platform",
      language: "en-CA",
      screen: { width: 1366, height: 768, devicePixelRatio: 1 },
    };

    await expect(
      claimPosDevice({ enrollmentCode: "ENROLL-TEST", meta }),
    ).resolves.toEqual({ success: true, deviceStableId: "pos_device_1" });
    await expect(
      loginPosSession({ email: "staff@example.com", password: "secret" }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/pos/devices/claim",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ enrollmentCode: "ENROLL-TEST", meta }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "staff@example.com",
          password: "secret",
          purpose: "pos",
        }),
      }),
    );
  });

  it("keeps HTTP session failures quiet but rejects successful contract drift", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          code: "HTTP_401",
          message: "Unauthorized",
          details: null,
        },
        401,
      ),
    );

    await expect(fetchPosSessionSnapshot()).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ sessionExpiresAt: "2026-09-01T00:00:00.000Z" }),
    );

    await expect(fetchPosSessionSnapshot()).rejects.toBeInstanceOf(ApiError);
  });

  it("loads the authenticated POS store context from the POS-owned endpoint", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        code: "OK",
        message: "success",
        details: {
          storeStableId: "store_b",
          storeName: "Store B",
          timezone: "America/Vancouver",
        },
      }),
    );

    await expect(fetchPosStoreContext()).resolves.toEqual({
      storeStableId: "store_b",
      storeName: "Store B",
      timezone: "America/Vancouver",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/pos/store-context",
      expect.objectContaining({
        credentials: "include",
        cache: "no-store",
      }),
    );
  });

  it("uses the canonical envelope for schedule and connectivity heartbeat", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          code: "OK",
          message: "success",
          details: { isOpenBySchedule: true },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: "OK",
          message: "success",
          details: { success: true },
        }),
      );

    await expect(fetchPosHeartbeatSchedule()).resolves.toBe(true);
    await expect(postPosConnectivityHeartbeat()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/public/store-status",
      expect.objectContaining({ credentials: "include", cache: "no-store" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/pos/devices/heartbeat",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        credentials: "include",
      }),
    );
  });
});
