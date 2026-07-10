import { describe, it, expect, vi } from "vitest";

describe("Auth Flow Logic", () => {
  it("should enforce strong passwords", () => {
    const isStrongPassword = (pw: string) => pw.length >= 6;
    expect(isStrongPassword("short")).toBe(false);
    expect(isStrongPassword("strongpw123")).toBe(true);
  });

  it("should correctly identify email domains", () => {
    const getDomain = (email: string) => email.split("@")[1];
    expect(getDomain("user@company.com")).toBe("company.com");
  });
});
