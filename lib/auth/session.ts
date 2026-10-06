import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/config";
import { resolveKstUsageWindow } from "@/lib/security/trial-network-bucket";
import {
  resolveAnonymousTrialActor,
  resolveAnonymousTrialCapability,
  type AiRouteActor,
  type AnonymousTrialCapability,
} from "@/lib/auth/trial-entitlement";

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

type AiActorDependencies = Readonly<{
  getCurrentUser?: typeof getCurrentUser;
  resolveAnonymousTrialActor?: typeof resolveAnonymousTrialActor;
  resolveCapability?: () => AnonymousTrialCapability | null;
  now?: () => Date;
  onUnauthenticated?: () => never;
}>;

/** Resolves either a normal user or an isolated exact-workspace Trial principal. */
export async function requireAiActor(
  request: Request,
  deps: AiActorDependencies = {},
): Promise<AiRouteActor> {
  // This client hint selects a narrower principal; signed Trial evidence is still required.
  const explicitTrial = request.headers.get("x-munjib-ai-mode") === "anonymous-trial-readonly";
  const user = explicitTrial ? null : await (deps.getCurrentUser ?? getCurrentUser)();
  const now = (deps.now ?? (() => new Date()))();
  if (user?.id) {
    return {
      admissionActor: { kind: "authenticated-user", userId: user.id },
      authorizationPrincipal: { kind: "user", userId: user.id },
      kstDate: resolveKstUsageWindow(now).kstDate,
    };
  }

  const resolver = deps.resolveAnonymousTrialActor ?? resolveAnonymousTrialActor;
  const capability = (deps.resolveCapability ?? resolveAnonymousTrialCapability)();
  const actor = resolver(request, capability, now);
  if (actor) return actor;
  (deps.onUnauthenticated ?? (() => redirect("/login")))();
  throw new Error("AI_ACTOR_REQUIRED");
}
