import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

type ApiEnvelope<T> = {
  code?: unknown;
  message?: unknown;
  details?: T;
};

type AuthMePayload = {
  role?: unknown;
  mfaVerifiedAt?: unknown;
  requiresTwoFactor?: unknown;
};

const STAFF_PASSWORD_ENV = "SANQ_E2E_STAFF_PASSWORD";
const API_LOG_ENV = "SANQ_E2E_API_LOG";
const ADMIN_EMAIL = "e2e-admin@example.invalid";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for Admin action-MFA browser E2E`);
  }
  return value;
}

async function loginAdmin(page: Page): Promise<void> {
  await page.goto("/en/staff/login", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page
    .locator('input[type="password"]')
    .fill(requiredEnv(STAFF_PASSWORD_ENV));
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/en\/admin(?:$|[/?#])/);
}

async function fetchAuthMe(page: Page): Promise<{
  status: number;
  payload: ApiEnvelope<AuthMePayload>;
}> {
  return page.evaluate(async () => {
    const response = await fetch("/api/v1/auth/me", {
      cache: "no-store",
      credentials: "include",
    });
    return {
      status: response.status,
      payload: (await response.json()) as ApiEnvelope<AuthMePayload>,
    };
  });
}

async function readApiLog(): Promise<string> {
  return readFile(requiredEnv(API_LOG_ENV), "utf8");
}

async function waitForAdminEmailOtp(afterIndex: number): Promise<string> {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const log = await readApiLog();
    const freshLog = log.slice(afterIndex);
    const match = freshLog.match(
      /to e2e-admin@example\.invalid:[\s\S]*?Your verification code is (\d{6})\.[\s\S]*?Purpose: admin_login/,
    );
    if (match?.[1]) return match[1];
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Admin email OTP was not observed in the E2E API log");
}

test.describe("A5-B2-B Admin action-MFA", () => {
  // OTP send cooldown makes an automatic second execution semantically different.
  // Keep this journey single-attempt while the rest of the browser suite retains
  // the global CI retry policy.
  test.describe.configure({ retries: 0 });

  test("protected Admin write redirects through real email MFA before it is admitted", async ({
    page,
  }) => {
    await loginAdmin(page);

    const beforeMfa = await fetchAuthMe(page);
    expect(beforeMfa.status).toBe(200);
    expect(beforeMfa.payload.details?.role).toBe("ADMIN");
    expect(beforeMfa.payload.details?.mfaVerifiedAt).toBeNull();
    expect(beforeMfa.payload.details?.requiresTwoFactor).toBe(true);

    await page.goto("/en/admin/members");
    await expect(
      page.getByRole("heading", { name: "Member Management" }),
    ).toBeVisible();

    const saveRules = page.getByRole("button", { name: "Save rules" });
    await expect(saveRules).toBeEnabled();

    const blockedWritePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/admin/benefits/loyalty-policy") &&
        response.request().method() === "PATCH",
    );
    await saveRules.click();
    const blockedWrite = await blockedWritePromise;

    expect(blockedWrite.status()).toBe(401);
    await page.waitForURL(/\/en\/admin\/2fa(?:$|[/?#])/);

    const logBeforeRequest = await readApiLog();
    const requestCodePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/auth/2fa/email/request") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "发送验证码" }).click();
    const requestCodeResponse = await requestCodePromise;

    expect(requestCodeResponse.ok()).toBe(true);
    await expect(page.getByText("验证码已发送到邮件。")).toBeVisible();

    const code = await waitForAdminEmailOtp(logBeforeRequest.length);
    expect(code).toMatch(/^\d{6}$/);

    const verifyPromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/auth/2fa/email/verify") &&
        response.request().method() === "POST",
    );
    await page.getByLabel("验证码").fill(code);
    await page.getByRole("button", { name: "完成验证" }).click();
    const verifyResponse = await verifyPromise;

    expect(verifyResponse.ok()).toBe(true);
    await page.waitForURL(/\/en\/admin(?:$|[/?#])/);

    const afterMfa = await fetchAuthMe(page);
    expect(afterMfa.status).toBe(200);
    expect(typeof afterMfa.payload.details?.mfaVerifiedAt).toBe("string");
    expect(afterMfa.payload.details?.requiresTwoFactor).toBe(false);

    await page.goto("/en/admin/members");
    await expect(
      page.getByRole("heading", { name: "Member Management" }),
    ).toBeVisible();

    const admittedSaveRules = page.getByRole("button", { name: "Save rules" });
    await expect(admittedSaveRules).toBeEnabled();

    const admittedWritePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/admin/benefits/loyalty-policy") &&
        response.request().method() === "PATCH",
    );
    await admittedSaveRules.click();
    const admittedWrite = await admittedWritePromise;

    expect(admittedWrite.ok()).toBe(true);
    await expect(page.getByText("Loyalty rules saved.")).toBeVisible();
  });
});
