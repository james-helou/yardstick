import { describe, expect, it } from "vitest";
import { parseAuditRequest } from "./schema";

describe("parseAuditRequest", () => {
  it("keeps the two fields it needs and collapses the rest", () => {
    const result = parseAuditRequest({
      businessName: "  Rivera   Plumbing ",
      email: " Owner@Rivera.example ",
      website: " riveraplumbing.example ",
      contactName: "",
      phone: "   ",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        businessName: "Rivera Plumbing",
        // Lowercased, because two people typing the same address differently are one person.
        email: "owner@rivera.example",
        website: "riveraplumbing.example",
      },
    });
  });

  it("reports every problem at once, since a public form gets one chance", () => {
    const result = parseAuditRequest({ businessName: "  ", email: "nope" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["businessName", "email"]);
  });

  it("asks for an email in words a visitor understands", () => {
    const result = parseAuditRequest({ businessName: "Acme", email: "nope" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.email).toBe("Enter an email we can send the report to");
  });

  it("refuses a name longer than any real business name", () => {
    const result = parseAuditRequest({ businessName: "x".repeat(201), email: "owner@acme.com" });
    expect(result.ok).toBe(false);
  });

  it("accepts the minimum: a name and somewhere to send the report", () => {
    expect(parseAuditRequest({ businessName: "Acme", email: "owner@acme.com" })).toEqual({
      ok: true,
      value: { businessName: "Acme", email: "owner@acme.com" },
    });
  });

  it("treats nothing at all as two missing fields, not a crash", () => {
    const result = parseAuditRequest(undefined);
    expect(result.ok).toBe(false);
  });
});
