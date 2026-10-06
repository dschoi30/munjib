import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DocumentList } from "@/components/document-list";
import { DocumentEditor } from "@/components/document-editor";
import { FolderDetail } from "@/components/folder-detail";
import { KnowledgeGraphView } from "@/components/knowledge-graph-view";
import { MetadataPanel } from "@/components/metadata-panel";
import { WorkspaceCenterShell } from "@/components/workspace-center-shell";
import { WorkspaceChatbot } from "@/components/workspace-chatbot";
import { WorkspaceModeProvider } from "@/components/workspace-mode";
import { resolveAnonymousTrialActor, resolveAnonymousTrialCapability, projectTrialAiAllowance, resolveTrialEntitlement } from "@/lib/auth/trial-entitlement";
import { getDefaultRagChatModel, getDefaultRagChatProvider, getRagChatProviderAvailability } from "@/lib/rag/model-config";
import { loadTrialWorkspaceViewer, loadTrialDocumentDetails, trialDocumentLinkPanels } from "@/lib/workspaces/trial-viewer";
import { buildKnowledgeGraph } from "@/lib/knowledge-graph/model";
import { normalizeTag, parseDocumentMetadata } from "@/lib/document-metadata/parser";
import { buildDocumentDisplayPathMap, buildFolderDisplayPathMap, countFolderChildren, folderDisplayPath } from "@/lib/workspace-tree";
import { rejectTrialMutation } from "./actions";

export const dynamic = "force-dynamic";

export default async function TrialWorkspacePage({ params, searchParams }: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ document?: string; folder?: string; graph?: string }>;
}) {
  const { workspaceSlug } = await params;
  const trialRequest = new Request(`https://trial.invalid/trial/workspaces/${workspaceSlug}`, { headers: await headers() });
  const actor = resolveAnonymousTrialActor(trialRequest, resolveAnonymousTrialCapability());
  if (!actor || actor.authorizationPrincipal.kind !== "anonymous-trial-demo") notFound();
  const workspace = await loadTrialWorkspaceViewer(actor.authorizationPrincipal, workspaceSlug);
  if (!workspace) notFound();
  const query = await searchParams;
  const isGraphView = query.graph === "1";
  const selectedFolder = workspace.folders.find(f => f.id === query.folder) ?? null;
  const isFreshEntry = query.document === undefined && query.folder === undefined && query.graph === undefined;
  const selectedDocument = selectedFolder && !isGraphView ? null : workspace.documents.find(d => d.id === query.document) ?? (isFreshEntry ? workspace.documents[0] ?? null : null);
  // Guessed/hidden IDs must not silently select a different document.
  if (query.document && !selectedDocument && !selectedFolder) notFound();
  if (query.folder && !selectedFolder) notFound();
  const details = selectedDocument ? await loadTrialDocumentDetails(workspace, selectedDocument.id) : null;
  const allowance = projectTrialAiAllowance(await resolveTrialEntitlement(trialRequest));
  const defaultChatModel = getDefaultRagChatModel();
  const defaultChatProvider = getDefaultRagChatProvider();
  const availableChatProviders = getRagChatProviderAvailability();
  const modelProps = {defaultChatModel,defaultChatProvider,availableChatProviders};
  const folderPaths = buildFolderDisplayPathMap([...workspace.folders]);
  const documentPaths = buildDocumentDisplayPathMap([...workspace.documents], folderPaths);
  const docs = workspace.documents.map(d => ({ ...d,
    displayPath:documentPaths.get(d.id)?.path ?? d.path,
    displayPathNeedsStoredPath:documentPaths.get(d.id)?.needsStoredPathDisambiguation ?? false,
    tagNames:parseDocumentMetadata(d.contentMarkdown).tags.map(normalizeTag), canWrite:false,
  }));
  const documentTabs = docs.map(({id,title,path,displayPath,displayPathNeedsStoredPath}) => ({id,title,path,displayPath,displayPathNeedsStoredPath}));
  const selectedTab = documentTabs.find(d => d.id === selectedDocument?.id) ?? null;
  const folder = selectedFolder ? { ...selectedFolder,displayPath:folderDisplayPath(selectedFolder,folderPaths),
    childCount:countFolderChildren({folderId:selectedFolder.id,folders:[...workspace.folders],documents:[...workspace.documents]}) } : null;
  const counts = docs.reduce<Record<string,number>>((n,d) => {if(d.folderId)n[d.folderId]=(n[d.folderId]??0)+1;return n;},{});
  const graph = isGraphView ? buildKnowledgeGraph({
    documents:docs.map(({id,title,path,contentMarkdown}) => ({id,title,path,contentMarkdown})),links:[...workspace.links],
    tags:docs.flatMap(d => d.tagNames.map(name => ({documentId:d.id,tag:{name,normalizedName:name}}))),
  }) : {nodes:[],links:[]};
  return <WorkspaceModeProvider mode="anonymous-trial-readonly" applicationOrigin={process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).origin : undefined}>
    <AppShell workspaceSlug={workspaceSlug}
      left={<DocumentList workspaceSlug={workspaceSlug} workspaceName={workspace.name}
        currentUser={{name:"Trial",email:""}} readableWorkspaces={[{id:workspace.id,name:workspace.name,slug:workspace.slug,role:"VIEWER"}]}
        folders={workspace.folders.map(f => ({...f,displayPath:folderDisplayPath(f,folderPaths)}))}
        documents={docs.map(({id,folderId,title,path,displayPath,displayPathNeedsStoredPath,contentText,tagNames,canWrite}) => ({id,folderId,title,path,displayPath,displayPathNeedsStoredPath,contentText,tagNames,canWrite}))}
        folderDocumentCounts={counts} canWrite={false} canManageWorkspace={false}
        createAction={rejectTrialMutation} createFolderAction={rejectTrialMutation} createWorkspaceAction={rejectTrialMutation}
        renameWorkspaceAction={rejectTrialMutation} archiveWorkspaceAction={rejectTrialMutation} importMarkdownAction={rejectTrialMutation}
        renameFolderAction={rejectTrialMutation} archiveFolderAction={rejectTrialMutation} archiveDocumentAction={rejectTrialMutation}
        archivedDocumentRetentionPolicy="NEVER" updateRetentionPolicyAction={rejectTrialMutation} folderError=""
        selectedFolderId={selectedFolder?.id ?? selectedDocument?.folderId ?? null} selectedDocumentId={selectedDocument?.id ?? null}
        isGraphView={isGraphView} {...modelProps}/ >}
      center={<WorkspaceCenterShell workspaceSlug={workspaceSlug} documents={documentTabs} selectedDocument={selectedTab}
        selectedFolder={folder} isGraphView={isGraphView} restoreStoredActiveTab={!query.document&&!query.folder&&!isGraphView}>
        {isGraphView ? <KnowledgeGraphView workspaceSlug={workspaceSlug} graph={graph} selectedDocumentId={selectedDocument?.id??null}/>
          : folder ? <FolderDetail folder={folder} canWrite={false}/>
          : <DocumentEditor workspaceSlug={workspaceSlug} document={selectedDocument?{id:selectedDocument.id,title:selectedDocument.title,contentMarkdown:selectedDocument.contentMarkdown}:null}
            canWrite={false} action={rejectTrialMutation} uploadAttachmentAction={rejectTrialMutation} pasteImageAttachmentAction={rejectTrialMutation}
            attachmentIds={details?.attachments.map(a=>a.id)??[]} linkCandidates={docs.map(({id,slug,title,path})=>({id,slug,title,path}))}
            tags={details?.tags.map(t=>t.tag)??[]} properties={details?.properties??[]}
            comments={details?.comments.map(c=>({...c,user:{name:"Demo",email:""}}))??[]}
            linkPanels={trialDocumentLinkPanels(workspace,selectedDocument?.id??"")}
            createFromBrokenLinkAction={rejectTrialMutation} createCommentAction={rejectTrialMutation} initialTrialAiAllowance={allowance} {...modelProps}/>}
      </WorkspaceCenterShell>}
      right={<MetadataPanel document={selectedDocument?{id:selectedDocument.id,contentMarkdown:selectedDocument.contentMarkdown}:null}
        versions={details?.versions??[]} auditLogs={details?.auditLogs??[]} attachments={details?.attachments??[]}
        canWrite={false} restoreVersionAction={rejectTrialMutation}/>}/>
    <WorkspaceChatbot mode="anonymous-trial-readonly" initialTrialAiAllowance={allowance} workspaceSlug={workspaceSlug}
      selectedDocumentId={selectedDocument?.id??null} {...modelProps}/>
  </WorkspaceModeProvider>;
}
