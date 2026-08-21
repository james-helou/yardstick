import { describe, expect, it } from "vitest";
import { escapeHtml, newLeadEmail, reportReadyEmail, TEMPLATES } from "./templates";

const REPORT = "https://yardstick.example/r/abc123";

describe("reportReadyEmail", () => {
  it("puts the link in both bodies, since half the world reads the plain text one", () => {
    const message = reportReadyEmail({
      to: "owner@rivera.example",
      agencyName: "Northline SEO",
      businessName: "Rivera Plumbing",
      contactName: "Ana Rivera",
      reportUrl: REPORT,
    });

    expect(message.template).toBe(TEMPLATES.reportReady);
    expect(message.subject).toBe("Your local search report for Rivera Plumbing");
    expect(message.text).toContain(REPORT);
    expect(message.html).toContain(REPORT);
    expect(message.text).toContain("Hi Ana,");
    expect(message.text).toContain("Prepared by Northline SEO.");
  });

  it("greets a person it was never given a name for, without an empty gap", () => {
    const message = reportReadyEmail({
      to: "owner@rivera.example",
      agencyName: "Northline SEO",
      businessName: "Rivera Plumbing",
      contactName: null,
      reportUrl: REPORT,
    });
    expect(message.text.startsWith("Hi,")).toBe(true);
  });

  it("sends replies to the agency, not to us", () => {
    const message = reportReadyEmail({
      to: "owner@rivera.example",
      agencyName: "Northline SEO",
      businessName: "Rivera Plumbing",
      reportUrl: REPORT,
      replyTo: "hello@northline.example",
    });
    expect(message.replyTo).toBe("hello@northline.example");
  });

  it("escapes a business name that arrived from a public form", () => {
    const message = reportReadyEmail({
      to: "owner@rivera.example",
      agencyName: "Northline SEO",
      businessName: '<script>alert("x")</script>',
      reportUrl: REPORT,
    });
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
  });
});

describe("newLeadEmail", () => {
  it("leads with everything needed to call them back", () => {
    const message = newLeadEmail({
      to: "hello@northline.example",
      businessName: "Rivera Plumbing",
      email: "owner@rivera.example",
      contactName: "Ana Rivera",
      phone: "514-555-0134",
      reportUrl: REPORT,
    });

    expect(message.template).toBe(TEMPLATES.newLead);
    expect(message.subject).toBe("New audit request: Rivera Plumbing");
    expect(message.text).toContain("Ana Rivera · owner@rivera.example · 514-555-0134");
    // Replying to the notification reaches the prospect, which is what a rep will try.
    expect(message.replyTo).toBe("owner@rivera.example");
  });

  it("leaves out the details it was not given, rather than printing empty separators", () => {
    const message = newLeadEmail({
      to: "hello@northline.example",
      businessName: "Rivera Plumbing",
      email: "owner@rivera.example",
      contactName: null,
      phone: "  ",
      reportUrl: REPORT,
    });
    expect(message.text).toContain("owner@rivera.example");
    expect(message.text).not.toContain("·");
  });
});

describe("escapeHtml", () => {
  it("covers every character that could close a tag or an attribute", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});
