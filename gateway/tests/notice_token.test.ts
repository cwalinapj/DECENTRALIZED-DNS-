import { describe, expect, it } from "vitest";
import { createNoticeToken, verifyNoticeToken, type DomainNoticePayload } from "../src/lib/notice_token.js";

describe("notice token", () => {
  it("signs and verifies payload", async () => {
    const payload: DomainNoticePayload = {
      domain: "example.com",
      phase: "A_SOFT_WARNING",
      issued_at: "2026-02-19T00:00:00Z",
      expires_at: "2026-02-19T00:15:00Z",
      reason_codes: ["RENEWAL_DUE_SOON"],
      policy_version: "mvp-2026-02",
      nonce: "abcd1234"
    };
    const { token, pubkey } = await createNoticeToken(payload);
    expect(token.length).toBeGreaterThan(10);
    expect(pubkey).toMatch(/^[0-9a-f]+$/i);
    const verified = await verifyNoticeToken(token);
    expect(verified.valid).toBe(true);
    expect(verified.payload?.domain).toBe(payload.domain);
    expect(verified.payload?.phase).toBe(payload.phase);
  });

  it("rejects malformed token", async () => {
    const verified = await verifyNoticeToken("bad.token.value");
    expect(verified.valid).toBe(false);
  });
});
