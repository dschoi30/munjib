import { describe, expect, it } from "vitest";
import {
  stripAmbientTokenMedia,
  zeroAmbientSessionImage,
} from "@/lib/auth/session-media-zero";
import {
  leaf4AuthUserOutput,
  leaf4SessionMediaHook,
  leaf4SessionMediaSlotVersion,
} from "@/lib/auth/downstream/leaf4";
import { authOptions } from "@/lib/auth/config";

describe("zero ambient session media", () => {
  it.each([
    undefined,
    null,
    "https://attacker.example/avatar.png",
    "/api/attachments/opaque-id",
    { url: "https://attacker.example/provider.png" },
  ])("always returns null for an ambient candidate (%j)", (candidate) => {
    expect(zeroAmbientSessionImage(candidate)).toBeNull();
  });

  it("strips both Auth.js media keys from a copied token", () => {
    const token = {
      sub: "user-1",
      name: "Owner",
      picture: "https://attacker.example/oauth.png",
      image: "https://attacker.example/avatar.png",
    };

    const stripped = stripAmbientTokenMedia(token);

    expect(stripped).toEqual({ sub: "user-1", name: "Owner" });
    expect(stripped).not.toBe(token);
    expect(token.picture).toBe("https://attacker.example/oauth.png");
    expect(token.image).toBe("https://attacker.example/avatar.png");
  });

  it("keeps the reserved Leaf 4 hook deterministic for all callback inputs", () => {
    expect(leaf4SessionMediaSlotVersion).toBe(0);
    expect(
      leaf4SessionMediaHook({
        token: { sub: "user-1", picture: "https://attacker.example/picture.png" },
        ambientImage: "https://attacker.example/session.png",
      }),
    ).toEqual({ token: { sub: "user-1" }, ambientImage: null });
  });

  it("emits a shape-valid identity DTO with a null image", () => {
    expect(
      leaf4AuthUserOutput({
        id: "user-1",
        email: "owner@example.com",
        name: "Owner",
      }),
    ).toEqual({
      id: "user-1",
      email: "owner@example.com",
      name: "Owner",
      image: null,
    });
  });

  it("sanitizes JWT and session callbacks even without a subject", async () => {
    const jwt = authOptions.callbacks?.jwt;
    const session = authOptions.callbacks?.session;
    if (!jwt || !session) throw new Error("Auth media callbacks are not configured.");

    const token = await jwt({
      token: {
        picture: "https://attacker.example/oauth.png",
        image: "https://attacker.example/avatar.png",
      },
      user: { id: "user-1" },
    } as never);
    expect(token).toEqual({ sub: "user-1" });

    const sessionValue = {
      user: {
        id: "user-1",
        name: "Owner",
        email: "owner@example.com",
        image: "https://attacker.example/session.png",
      },
      expires: "2030-01-01T00:00:00.000Z",
    };
    await session({ session: sessionValue, token: {} } as never);
    expect(sessionValue.user.image).toBeNull();
  });
});
