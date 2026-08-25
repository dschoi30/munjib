import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AiAnswer } from "@/components/ai/answer";
import { AiAssistantPanel } from "@/components/document-editor/ai-assistant-panel";
import { WorkspaceChatbot } from "@/components/workspace-chatbot";
import {
  resolveAnonymousTrialActor,
  resolveAnonymousTrialCapability,
  projectTrialAiAllowance,
  resolveTrialEntitlement,
} from "@/lib/auth/trial-entitlement";
import {
  getDefaultRagChatModel,
  getDefaultRagChatProvider,
  getRagChatProviderAvailability,
} from "@/lib/rag/model-config";
import { loadTrialWorkspaceViewer } from "@/lib/workspaces/trial-viewer";

export const dynamic = "force-dynamic";

export default async function TrialWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ document?: string }>;
}) {
  const { workspaceSlug } = await params;
  const requestHeaders = await headers();
  const trialRequest = new Request(`https://trial.invalid/trial/workspaces/${workspaceSlug}`, {
    headers: requestHeaders,
  });
  const actor = resolveAnonymousTrialActor(trialRequest, resolveAnonymousTrialCapability());
  if (!actor || actor.authorizationPrincipal.kind !== "anonymous-trial-demo") notFound();

  const workspace = await loadTrialWorkspaceViewer(actor.authorizationPrincipal, workspaceSlug);
  if (!workspace) notFound();
  const { document: requestedDocumentId } = await searchParams;
  const selectedDocument =
    workspace.documents.find((document) => document.id === requestedDocumentId) ??
    workspace.documents[0] ??
    null;
  const initialTrialAiAllowance = projectTrialAiAllowance(
    await resolveTrialEntitlement(trialRequest),
  );
  const defaultChatProvider = getDefaultRagChatProvider();
  const defaultChatModel = getDefaultRagChatModel();
  const availableChatProviders = getRagChatProviderAvailability();

  return (
    <main className="min-h-screen bg-surface-page text-ink">
      <header className="border-b border-border bg-surface px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">읽기 전용 Trial</p>
            <h1 className="text-xl font-semibold">{workspace.name}</h1>
          </div>
          <Link className="text-sm font-medium text-[#174a76] hover:underline" href="/login">
            로그인
          </Link>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-6 md:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label="Trial 문서" className="rounded-xl border border-border bg-surface p-3">
          <p className="px-2 pb-2 text-xs font-semibold text-ink-muted">공개 데모 문서</p>
          <ul className="space-y-1">
            {workspace.documents.map((document) => (
              <li key={document.id}>
                <Link
                  className="block rounded-md px-2 py-2 text-sm hover:bg-surface-muted"
                  href={`/trial/workspaces/${workspace.slug}?document=${encodeURIComponent(document.id)}`}
                >
                  {document.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <article className="min-w-0 rounded-xl border border-border bg-surface p-6 shadow-card">
          {selectedDocument ? (
            <>
              <h2 className="mb-5 text-2xl font-semibold">{selectedDocument.title}</h2>
              <AiAnswer content={selectedDocument.contentMarkdown} />
              <div className="mt-6 border-t border-border pt-6">
                <AiAssistantPanel
                  mode="anonymous-trial-readonly"
                  initialTrialAiAllowance={initialTrialAiAllowance}
                  workspaceSlug={workspace.slug}
                  documentId={selectedDocument.id}
                  hasUnsavedChanges={false}
                  defaultChatProvider={defaultChatProvider}
                  defaultChatModel={defaultChatModel}
                  availableChatProviders={availableChatProviders}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-muted">표시할 수 있는 데모 문서가 없습니다.</p>
          )}
        </article>
      </div>
      <WorkspaceChatbot
        mode="anonymous-trial-readonly"
        initialTrialAiAllowance={initialTrialAiAllowance}
        workspaceSlug={workspace.slug}
        selectedDocumentId={selectedDocument?.id ?? null}
        defaultChatProvider={defaultChatProvider}
        defaultChatModel={defaultChatModel}
        availableChatProviders={availableChatProviders}
      />
    </main>
  );
}
