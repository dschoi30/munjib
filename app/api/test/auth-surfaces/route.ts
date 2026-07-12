import {
  leaf4AuthUserOutput,
  leaf4SessionMediaHook,
} from "@/lib/auth/downstream/leaf4";
import { isTestTransportEnabled } from "@/lib/security/test-transport";

export const dynamic = "force-dynamic";

/**
 * Auth/session surface harness for the zero-egress browser oracle. It is not
 * reachable unless the test-only provider transport is enabled, and exercises
 * the same downstream sanitizer with tainted provider/JWT/session candidates.
 */
export async function GET(request: Request) {
  if (!isTestTransportEnabled()) {
    return new Response("Not found", { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const providerImage = params.get("providerImage");
  const providerPicture = params.get("providerPicture");
  const jwtImage = params.get("jwtImage");
  const jwtPicture = params.get("jwtPicture");
  const sessionImage = params.get("sessionImage");
  const user = leaf4AuthUserOutput({
    id: "zero-egress-test-user",
    email: "zero-egress-test@example.com",
    name: "Zero Egress Test",
  });
  const media = leaf4SessionMediaHook({
    token: { sub: user.id, image: jwtImage, picture: jwtPicture },
    ambientImage: sessionImage,
  });

  return Response.json({
    user,
    providerProfile: {
      image: leaf4SessionMediaHook({ ambientImage: providerImage }).ambientImage,
      picture: leaf4SessionMediaHook({ ambientImage: providerPicture }).ambientImage,
    },
    jwtPayload: media.token,
    sessionPayload: { user: { image: media.ambientImage } },
  });
}
