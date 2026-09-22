import { describe, expect, it } from "vitest";
import { createTranslator } from "~/i18n/translate";
import { buildLoginCodeEmail } from "./email-otp.server";

describe("sign-in email", () => {
  it("keeps the English email exactly as it was before the Chinese interface", () => {
    expect(buildLoginCodeEmail(createTranslator("en"), "042917")).toEqual({
      subject: "042917 is your bcailab sign-in code",
      text: [
        "Your bcailab sign-in code is: 042917",
        "",
        "It expires in 10 minutes. If you didn't request this, you can ignore this email."
      ].join("\n")
    });
  });

  it("writes the Chinese email with the same code", () => {
    const email = buildLoginCodeEmail(createTranslator("zh"), "042917");
    expect(email.subject).toBe("042917 是你的 bcailab 登录验证码");
    expect(email.text).toContain("你的 bcailab 登录验证码是：042917");
    expect(email.text).toContain("10 分钟");
  });
});
