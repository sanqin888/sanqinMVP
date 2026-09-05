import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

describe("POS member recharge verification hardening", () => {
  it("does not enter code-sent when the backend reports ok=false", () => {
    const handlerStart = pageSource.indexOf("const handleSendCode = async () => {");
    const handlerEnd = pageSource.indexOf(
      "const handleVerifyCode = async () => {",
      handlerStart,
    );
    const handlerSource = pageSource.slice(handlerStart, handlerEnd);
    const failureGuard = handlerSource.indexOf("if (!res.ok)");
    const codeSent = handlerSource.indexOf('setRechargeStep("code-sent")');

    expect(handlerStart).toBeGreaterThan(-1);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    expect(failureGuard).toBeGreaterThan(-1);
    expect(handlerSource).toContain("return;");
    expect(codeSent).toBeGreaterThan(failureGuard);
    expect(handlerSource).toContain("copy.errors.codeCooldown");
    expect(handlerSource).toContain("copy.errors.codeDailyLimit");
    expect(handlerSource).toContain("copy.errors.codeFailed");
  });

  it("keeps bilingual cooldown and daily-limit messages", () => {
    expect(pageSource).toContain("请稍候一分钟后再发送验证码。");
    expect(pageSource).toContain("今日验证码发送次数已达上限。");
    expect(pageSource).toContain(
      "Please wait a minute before sending another code.",
    );
    expect(pageSource).toContain("Daily verification code limit reached.");
  });
});
