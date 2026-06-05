---
id: workflow-document-editing
title: Document Editing Workflow
type: workflow
status: active
summary: Munjib에서 문서 편집, 생성, 수정, 버전 저장, 링크 reconciliation, 감사 로그가 이어지는 흐름.
created: 2026-04-29
updated: 2026-06-06
source_count: 70
tags:
  - munjib
  - workflow
  - documents
  - 문서
  - 편집
links:
  - "[[Munjib]]"
  - "[[Document Knowledge Model]]"
  - "[[Folder Hierarchy Model]]"
  - "[[Wiki Links And Backlinks]]"
  - "[[Auth And Permissions Workflow]]"
  - "[[Markdown Import And Clipboard Paste Workflow]]"
---

# Document Editing Workflow

문서 편집 흐름은 Next.js server action에서 시작해 `lib/documents/service.ts`의 service function으로 내려간다. 권한 확인, DB mutation, version 생성, link reconciliation, audit log 작성이 같은 transaction 안에서 처리된다.

## 화면 진입

`app/workspaces/[workspaceSlug]/page.tsx`는 현재 사용자를 요구하고 workspace를 조회한다. workspace membership이 없으면 `notFound()`로 빠진다. active document는 `updatedAt desc`로 정렬되어 좌측 목록에 표시된다.

선택 문서가 있으면 오른쪽 panel은 다음 데이터를 읽는다.

- document versions
- recent audit logs
- attachments
- outgoing links, backlinks, broken links
- tags, frontmatter properties, comments

오른쪽 metadata panel은 상단 icon tab에서 `Attachments`, `Versions`, `Audit log`를 선택할 때 해당 목록만 표시한다. Panel 우측 상단의 close control은 오른쪽 sidebar를 접고, 화면 우측 상단의 reopen icon 하나로 다시 펼친다.

좌측 navigation은 recent documents, folder/document tree, search panel, localStorage favorites panel을 제공한다. Issue #79와 Issue #83 이후 `Recents`는 workspace-scoped `munjib:recents:<workspaceSlug>` localStorage selection history에서 최대 5개를 보여주되, 현재 editor에 표시 중인 selected document는 visible Recents 목록에서 제외한다. Selected document id는 session/reload 보존을 위해 history에 저장하지만 UI에서 필터되므로, 다른 document로 이동한 뒤에야 직전 selected document가 Recents 맨 앞에 보인다. Stored id가 더 이상 readable documents에 없으면 화면에서 제외하며, history가 5개보다 짧으면 workspace page가 내려준 readable document 순서로 나머지를 채운다. Favorites localStorage 상태와는 무관하게 같은 recent 후보를 유지한다. Issue #32 이후 sidebar의 always-visible title/body search form은 제거되었고, `Search` icon button 또는 `Ctrl+K`가 document list 영역을 검색 결과 panel로 전환한다. `Documents` icon button 또는 `Escape` key는 search/favorites panel에서 기본 document list로 되돌린다. 검색은 permission filter를 통과한 readable document의 title, path, `contentText`를 기준으로 한다.

Issue #71은 같은 Search panel에 Obsidian-style tag query를 추가했다. 사용자가 `tag:#LangChain` 또는 `tag:LangChain`을 직접 입력하면 exact normalized tag match로 검색하고, partial tag query는 matching하지 않는다. 검색 대상 tag index는 YAML frontmatter `tags:`와 body `#tag` reconciliation 결과를 모두 포함하지만, Properties row 자체는 계속 frontmatter tags만 표시한다. Frontmatter tag chip, preview mode 본문 `#tag`, graph view의 tag node를 클릭하면 sidebar Search panel이 열리고 input이 `tag:#<tag>` 값으로 채워진다. Issue #85 이후 left sidebar가 접혀 있어도 tag search request는 sidebar를 다시 열고 같은 Search panel/input state를 적용한다. Body inline tag parsing and preview linking support Unicode letter/number tag names, so Korean tags such as `#로드맵` and mixed tags such as `#AI_요약` are clickable and searchable. Workspace sidebar search and graph tag nodes derive their tag list from the current readable document markdown at render time, so existing documents with Korean tags are searchable without waiting for a save/reconcile cycle.

Issue #20 설계 이후 좌측 navigation은 flat document list에서 folder/document tree로 바뀐다. Folder 선택 시 markdown editor가 아니라 folder detail/empty state를 보여주고, document 선택 시 기존 editor panel을 연다.

Issue #34 workspace knowledge graph view는 sidebar `Graph` icon으로 진입한다. 이 button은 URL을 `?graph=1`로 바꾸고, center 영역은 editor/folder detail 대신 workspace knowledge graph를 렌더링하며, toolbar path는 `Graph view`로 표시한다. Graph의 document node를 클릭하면 `?document=<id>` route로 이동해 graph mode를 종료하고 해당 document editor를 연다. Issue #36 이후 graph panel은 relation `Filters` 아래에 `Display`와 `Forces` 설정을 제공한다. `Display`는 arrows, text fade threshold, node size, link thickness를 조절하고, display state 변경 시 graph animation을 재개해 cooled canvas에서도 label fade redraw가 반영되게 한다. `Forces`는 center/repel/link force와 link distance를 `react-force-graph-2d` simulation에 적용한다. Center force는 `forceCenter.strength()`에 의존하지 않고 `d3Force("munjib-center", forceFn)`로 등록되는 custom gravity force를 사용하며, dynamic graph ref가 늦게 mount되어도 기본 force 값이 다시 적용된다. Graph link는 relation 종류별 색상이 아니라 neutral gray로 렌더링하며, 선택 문서 또는 hover node의 1-hop link만 더 밝게 표시한다. Hover node id가 graph refresh 이후 더 이상 존재하지 않으면 hover focus를 무시하고 selected document focus로 되돌린다. Hover focus가 활성일 때 연결되지 않은 node circle은 더 낮은 alpha로 표시하고 해당 label alpha도 낮춰, hovered node와 1-hop 이웃이 시각적으로 더 두드러지게 한다. Node label은 circle 중심과 겹치지 않도록 node center보다 아래에 그리며, graph가 일정 수준 이상 줌아웃되면 label을 숨겨 과밀 상태를 줄인다. Graph mode는 editor padding 없이 center 영역 높이를 채우고, graph canvas background는 `DocumentToolbar`와 같은 흰색 surface를 사용한다. Issue #38 이후 graph settings panel은 Obsidian reference처럼 graph canvas 우측 상단에 배치되며, panel surface는 sidebar/document list와 같은 `bg-muted` 계열을 사용한다. Panel-level `X` close는 settings panel 전체를 숨기고 같은 위치에 reopen icon button만 남긴다. `Filters`, `Display`, `Forces` section은 `DocumentNavigation` folder toggle과 같은 `ChevronDown`/`ChevronRight` icon을 section text 좌측에 배치한 button으로 접고 펼치며, `X` close는 `Filters` header row 우측에 배치한다. Issue #65 이후 graph filters는 `Tags`와 `Orphans`만 노출한다. Wiki links는 항상 적용되고 property graph rendering은 제거되었다. `Display`와 `Forces`는 기본 닫힘 상태이며, node size 기본값은 `3`과 range `1..10`, link thickness max는 `5`다. 선택/hover focus는 link width를 변경하지 않고 색상과 alpha만 바꾼다. Issue #67 이후 `Tags`와 `Orphans` filters는 기본 unchecked이며, filters/display/forces option state는 workspace slug로 scope된 `sessionStorage`에 저장되어 같은 browser session 동안 유지된다. Graph renderer는 `minZoom`/`maxZoom` bounds로 node와 label이 과도하게 작거나 커지지 않게 제한하고, 첫 graph render frame 이후 selected document 좌표가 준비되면 해당 문서를 중심으로 최초 zoom을 `2.5`로 한 번 설정한다. Label font는 zoom에서 계산한 값을 minimum/maximum으로 clamp한 bounded scaling을 사용하고, label 위치는 effective node size와 font size를 기준으로 node 아래에 배치한다. Node size slider 값은 workspace document-count tier baseline과 곱해 effective node size가 되므로 문서 수가 많은 workspace는 더 compact하게 렌더링된다.

Tree row는 folder와 document를 `path` 기준으로 정렬한다. Tree 안의 folder row는 accordion toggle button이라 클릭해도 editor target을 바꾸지 않고 하위 row를 열고 닫는다. Favorite folder link와 folder server-action redirect는 `?folder=<id>`로 folder detail view를 열고, document row와 favorite document link는 `?document=<id>`로 editor를 연다. Document row는 hover/focus 상태에서 더 진한 `bg-slate-200` highlight를 보여주고, 선택된 document row도 같은 고정 highlight를 유지한다.

Sidebar favorites는 always-visible star icon이 아니라 row-level `...` menu에서 관리한다. Document favorites와 folder favorites는 workspace-scoped localStorage에 저장된다. `Favorites` icon button은 document list 영역을 favorites-only panel로 전환하며, favorite section은 더 이상 `Recents` 위에 상시 노출되지 않는다. Favorite folder는 folder detail view를 열고, favorite document는 editor를 연다. Favorite folder row도 `...` menu에서 Remove from favorites를 제공한다. Document row `...` menu는 Add/Remove favorites와 Move to trash를 제공하되, 현재 user가 해당 document를 쓸 수 있을 때만 Move to trash를 노출한다. Row action menu는 trigger 또는 menu surface 밖을 클릭하면 닫힌다.

Issue #85 이후 `Company Handbook` workspace name text는 chevron 없는 workspace menu trigger다. Trigger를 클릭하면 sidebar content width를 채우는 dropdown menu가 열리고, 현재 첫 item은 `Settings` 하나다. `Settings`는 기존 `WorkspaceSettingsPanel` modal을 열며, dialog 내부는 좌측 settings sidebar와 우측 content pane으로 구성되고 첫 slice에서는 `Import` menu가 기본 선택된 상태로 열린다. 좌측 sidebar header 오른쪽의 기존 gear slot은 right metadata panel과 같은 결의 반대 방향인 `PanelLeftClose` button으로 바뀌며, 클릭하면 `AppShell`이 left sidebar column을 접고 center content를 확장한다. 접힌 상태에서는 화면 좌측 상단의 `PanelLeftOpen` button으로 sidebar를 다시 연다. 이때 center `DocumentTabs` row는 leading reopen slot을 예약해 `PanelLeftOpen` button이 첫 tab과 겹치지 않게 한다. Workspace title row와 Documents/Graph/New document/New folder/Search/Favorites icon toolbar는 sticky sidebar chrome으로 묶여 긴 Recents, folder tree, search, favorites content를 스크롤해도 항상 보이고, document navigation body만 그 아래에서 스크롤된다.

Issue #40 이후 workspace settings dialog는 document list를 교체하지 않고 modal dialog로 열린다. Dialog는 close button뿐 아니라 backdrop click으로도 닫히지만, dialog surface 내부 click은 닫힘으로 처리하지 않는다.

Issue #73 이후 `DocumentEditor` title input 우측에는 `AI에게 묻기` button이 있고, 선택 문서가 있을 때 작은 assistant panel을 열고 닫는다. Panel은 `/api/workspaces/{workspaceSlug}/documents/{documentId}/ask`에 trimmed question만 POST하며, 현재 editor의 unsaved title/content draft는 request body에 넣지 않는다. 현재 title 또는 markdown state가 선택된 saved document와 다르거나 clipboard image paste가 아직 업로드 중이면 `저장되지 않은 변경사항은 AI 답변에 반영되지 않습니다.` warning을 보여 saved DB content 기준 답변임을 알린다. 문서 전환 시 assistant panel은 document id 기준으로 새로 mount되어 이전 문서의 질문, 답변, citation state를 다음 문서에 보여주지 않는다. 답변 근거는 저장된 DB 문서 내용으로 제한하며, retriever는 현재 문서 chunk를 우선하고 wiki link target, backlink source, same-tag document, workspace fallback chunk를 graph-aware score로 보강한다. Ask route는 recoverable RAG/Ollama runtime failure를 `AI_UNAVAILABLE` 503으로 정규화하고, assistant panel은 raw server/model details 없이 generic failure state를 보여준다. 기본 모델은 Ollama `gemma4:e4b`와 `bge-m3`이다. pgvector 기반 chunk index는 saved `Document`에서만 파생하며 세부 데이터 모델은 [[Document Knowledge Model]]에 기록한다. 설계 근거는 `docs/superpowers/specs/2026-05-30-document-ai-rag-assistant-design.md`이다.

Issue #100 설계는 이 UI와 route response shape를 바꾸지 않고 RAG model boundary만 provider-neutral LangChain seam으로 옮기는 계획이다. Ask flow의 permission check, saved document indexing, graph-aware scope, pgvector search, rerank, citation metadata는 유지하고, prompt formatting과 chat invocation은 LangChain LCEL chain으로 구성한다. Chat provider는 server env로 Ollama, OpenAI, OpenAI-compatible endpoint 중 선택할 수 있고, embedding provider 설정도 같은 provider set을 이해하지만 현재 indexed identity인 Ollama `bge-m3` 1024와 다른 embedding identity는 reindex follow-up 전까지 live Ask AI에서 fail-fast한다. Workspace별 또는 request별 override는 첫 slice에서 제외한다. Langfuse tracing은 optional/fail-open이고 production에서는 prompt/context/question/answer body를 의도적으로 보내지 않는 metadata-focused mode가 기본이다.

## 생성 흐름

`createDocumentAction()`은 현재 user를 확인한 뒤 `createDocument()`를 호출한다.

Issue #32 이후 `createDocumentAction()`은 template key를 받지 않고 항상 blank document를 만든다. Issue #20 구현 이후 folder creation은 document template이 아니라 `createFolderAction()`과 `lib/folders/service.ts`가 담당한다. Sidebar top-level create control은 항상 workspace root를 hidden form value로 제출하고 server-action redirect path를 유지해 hydration 전 form submission도 생성된 document/folder URL로 이동한다. Folder-scoped creation은 folder row action menu의 `Add folder`와 `Add document`가 담당한다.

Issue #20 구현에서 `createDocument()`는 `folderId`를 받을 수 있다. Top-level `New document`는 선택된 folder와 무관하게 workspace root 아래 `Untitled` blank document를 생성한다. Top-level `New folder`도 선택된 folder와 무관하게 root `Folder` row를 생성한다. Sidebar top-level `Documents`, `New document`, `New folder`, `Search`, `Favorites` controls는 `Company Handbook` 제목 아래의 icon-only toolbar로 표시한다. `Company Handbook` row는 center `DocumentTabs` row와, icon toolbar row는 center `DocumentToolbar` row와 같은 vertical origin/height에 맞춘다. 각 icon button은 shadcn/Radix Tooltip으로 hover 설명을 표시한다.

`createDocument()`는 다음을 수행한다.

1. workspace membership을 조회한다.
2. read/write 권한을 확인한다.
3. 선택 folder 안에서 unique slug를 만든다.
4. folder path와 document slug를 결합한 `path`와 함께 `Document`를 생성한다.
5. `DocumentVersion` v1을 만든다.
6. wiki links와 document metadata를 reconcile한다.
7. `document.created` audit log를 남긴다.
8. transaction commit 뒤 `scheduleSavedDocumentIndex({ documentId })`로 saved DB content 기반 RAG chunk refresh를 Next.js `after()` hook에 예약한다.
9. indexing latency나 failure는 save 성공을 막지 않고 failure는 service logger에만 남긴다.
10. server action이 생성 문서 URL로 redirect한다.

`importMarkdownDocumentAction()`은 settings dialog의 Markdown file form을 받아 Markdown file을 workspace document로 만든다. 지원 file type, title derivation, image URL preservation, create/save 확정 시점은 [[Markdown Import And Clipboard Paste Workflow]]에 따로 정리한다.

`moveDocument()`는 문서의 `folderId`를 바꾸고 target folder path 아래로 `path`를 재계산한다. 이동은 `document.moved` audit log에 previous path와 새 path를 남긴다. Move는 `Document.updatedAt`을 바꾸므로 commit 뒤 RAG chunk refresh를 예약해 `sourceUpdatedAt` freshness를 유지한다.

## 수정 흐름

`updateDocumentAction()`은 form data의 `documentId`, `title`, `contentMarkdown`을 받아 `updateDocument()`를 호출한다. 저장 후 workspace path만 revalidate하고 같은 문서 query로 redirect하지 않는다. 현재 문서 저장은 이미 같은 editor surface 안에서 완료 상태를 갱신하므로, redirect를 추가하면 document editor가 재마운트되어 저장 시 화면 깜빡임이 다시 발생한다.

`updateDocument()`는 다음을 수행한다.

1. document와 workspace membership을 조회한다.
2. write 권한을 확인한다.
3. 현재 folder 안에서 title에 맞춰 unique slug를 다시 계산한다. 현재 document id는 중복 검사에서 제외한다.
4. markdown, plain text, title, slug, path, updatedBy를 갱신한다.
5. 다음 version number로 `DocumentVersion`을 생성한다.
6. source 문서의 wiki links와 document metadata를 reconcile한다.
7. `document.updated` audit log를 남긴다.
8. transaction commit 뒤 `scheduleSavedDocumentIndex({ documentId })`로 saved DB content 기반 RAG chunk refresh를 Next.js `after()` hook에 예약한다. Indexing latency나 failure는 update 성공을 막지 않는다.

## Version restore, attachment, comment

`restoreDocumentVersion()`은 선택한 `DocumentVersion`의 title과 markdown으로 현재 문서를 되돌린다. 복원도 새 version을 생성하고 `document.version_restored` audit log를 남기며, links와 metadata를 다시 reconcile한다. Commit 뒤에는 복원된 saved content로 RAG chunk refresh를 예약하고, indexing latency나 failure는 복원 성공을 막지 않는다.

`uploadDocumentAttachmentAction()`은 file upload를 받아 `uploadDocumentAttachment()`로 넘긴다. service는 5MB 이하의 허용 MIME type만 받아 `storage/attachments/`에 저장하고, image는 `![file](/api/attachments/<id>)`, 그 외 파일은 `[file](/api/attachments/<id>)` markdown link를 본문 끝에 append한다. DB transaction 실패 시 이미 쓴 파일은 삭제한다. Manual attachment upload는 saved markdown을 변경하므로 transaction commit 뒤 해당 문서의 RAG chunk refresh를 예약한다.

Issue #52의 paste-only attachment service는 `uploadPastedDocumentImageAttachment()`로 분리된다. 이 helper는 clipboard image paste에서 attachment row와 `attachment.uploaded` audit log만 생성하며 `Document.contentMarkdown`, `DocumentVersion`, link/metadata reconciliation은 바로 건드리지 않는다. Clipboard image paste는 service layer에서 saved markdown을 바꾸지 않으므로 RAG indexing도 실행하지 않고, markdown insertion은 editor draft와 이후 Save 흐름에 맡긴다. Clipboard image file paste, HTML `<img>` paste, remote image URL server fetch, pending draft, Save guard 세부 흐름은 [[Markdown Import And Clipboard Paste Workflow]]에서 본다.

`createCommentAction()`은 문서에 comment를 추가하고 `comment.created` audit log를 남긴다. 빈 comment는 거부된다. Comment 저장도 현재 문서 query로 redirect하지 않고 workspace path revalidation만 수행해 DocumentEditor remount와 화면 깜빡임을 피한다.

## 아카이브와 broken link 생성

`archiveDocument()`는 문서 status를 `ARCHIVED`로 바꾸고 `archivedAt`을 채운다. 현재 workspace 문서 목록은 active 문서만 보여준다. `archiveDocumentAction()`은 workspace path를 revalidate하고 archived document id를 반환한다.

Sidebar row-level document trash는 `archiveDocumentAction()`의 반환값을 받아 client side에서 처리한다. 현재 열려 있는 document를 삭제한 경우에만 workspace root로 이동하고, 다른 row를 삭제한 경우에는 현재 editor context를 유지한 채 refresh한다.

Issue #20의 folder archive 정책은 비어 있지 않은 folder archive를 차단하는 것이다. 사용자는 먼저 하위 folder/document를 이동하거나 archive해야 한다. Recursive archive/restore는 MVP 범위에서 제외한다.

`createDocumentFromBrokenLink()`는 broken `DocumentLink`에서 target title을 가져와 루트 경로의 blank document를 만들고, 같은 raw target title을 가진 broken links를 repair한다. 생성 transaction이 commit된 뒤 새 blank document의 saved content 기준으로 RAG chunk replacement를 실행해 기존 stale chunk가 있으면 비운다.

## UI 세부 사항

`DocumentEditor`는 controlled title과 markdown state를 사용하며, 문서 선택이 바뀌면 `useEffect`로 title/content/completion state를 새 문서 값으로 재설정한다. Title input은 Obsidian-style reading surface에 맞춰 borderless heading-size control로 렌더링한다.

Editor는 edit/preview mode를 제공하며 split mode는 Issue #25 구현에서 제거되었다. Issue #31에서 edit/preview control은 editor 내부 segmented text buttons가 아니라 navigation toolbar 오른쪽의 single icon toggle로 이동했다. Preview 상태에서는 edit icon만 보이고, edit 상태에서는 preview icon만 보여 두 mode가 교대로 전환된다. Mode 전환은 workspace center scroll container의 현재 `scrollTop`을 복원해 문서 중간에서 edit/preview를 오가도 화면이 맨 위로 점프하지 않는다. CodeMirror markdown editor는 `[[` 입력 중 workspace 문서 후보를 보여주는 autocomplete를 제공한다. Duplicate title 후보는 path-qualified label과 insert text를 사용해 folder-aware wiki link를 삽입한다. Clipboard paste는 image file, rich HTML image, rich HTML text, plain text 순서로 분기하며, image/attachment 세부 처리와 Save 확정 시점은 [[Markdown Import And Clipboard Paste Workflow]]에 정리한다. 외부 앱에서 rich text를 붙여넣을 때 clipboard HTML이 있으면 heading, bold, italic, link, list, code, blockquote 같은 semantic style을 Markdown으로 변환해 저장 모델은 `contentMarkdown`으로 유지한다. HTML-to-Markdown 변환은 inline element 사이 공백, backtick을 포함한 inline code delimiter, inline code 내부 의미 있는 공백, nested list indentation, table cell/row boundary, fenced code block 내부 fence 충돌을 보존한다.

Preview mode는 YAML frontmatter block을 본문에서 제외한 뒤 `[[Target Title]]` text를 그대로 노출하지 않고, 읽을 수 있는 workspace document와 matching되는 target을 `?document=<id>` link로 렌더링한다. `[[Target Title|Alias]]`는 alias를 label로 사용한다. Matching document가 없는 target은 bracket 없는 plain text로 표시된다. Preview paragraph는 CSS `white-space: pre-wrap`으로 렌더링하고, ReactMarkdown remark transform이 paragraph 내부 soft line break를 explicit break node로 바꿔 edit mode에서 입력한 단일 개행과 외부 텍스트 paste 개행을 preview에 안정적으로 반영한다.

Title 아래 Properties 영역은 tags, links, frontmatter properties, comments를 표시한다. Properties row는 YAML frontmatter key 순서대로 배치하며, `tags`와 `links` key 위치에는 raw YAML 값 대신 canonical UI row를 렌더링한다. 최신 정책은 Properties tags row의 source of truth를 YAML frontmatter `tags:`로만 제한하는 것이다. 본문 content의 `#tag`는 knowledge graph/tag extraction 용도로만 사용하고, frontmatter `tags:`가 없는 문서에서 Properties tags fallback row로 표시하지 않는다. Issue #71 이후 frontmatter tag chip은 클릭 가능한 tag search trigger이지만, 표시 source는 여전히 frontmatter `tags:`로 제한한다. Links row는 YAML frontmatter `links:` 배열 안의 `[[...]]`에서 만든 outgoing links만 보여주고, broken link는 연한 텍스트 button으로 표시해 클릭 시 blank document 생성을 실행한다. Content 영역의 `[[...]]`와 backlinks는 Properties Links row에서 제외한다. YAML frontmatter property와 frontmatter links는 각각 `sortOrder`와 현재 frontmatter `links:` 배열 순서를 기준으로 읽어 markdown 파일에 적힌 속성/링크 순서를 유지한다. Frontmatter가 없는 문서에서는 `frontmatter none` placeholder row를 렌더링하지 않는다. Comments는 위에서 아래로 쌓이며 `createdAt asc` 순서로 읽는다.

우측 metadata panel은 outline, attachments, versions, audit log를 상단 tab button으로 전환해 표시한다. Section 영역이 scroll container이며 edit mode의 markdown 표시 영역은 고정 높이를 강제하지 않는다. Metadata panel close button은 오른쪽 sidebar를 제거하고, 화면 우측 상단에 남는 reopen icon 하나로 다시 열 수 있다.

Issue #44 이후 metadata panel의 첫 번째 tab은 `Outline`이다. Outline은 현재 선택 문서 markdown 원문에서 `#`, `##`, `###`, `####` ATX heading을 추출하되 YAML frontmatter와 fenced code block 내부 heading-like line은 제외한다. Empty heading과 closing marker만 남는 heading도 outline에서 제외한다. `DocumentEditor`는 저장 전 `contentMarkdown` state도 `AppShell` heading navigation context에 등록하므로 outline은 server snapshot이 아니라 현재 편집 중인 live markdown을 우선 사용한다. Heading tree는 `DocumentNavigation` tree와 같은 `border-l` vertical guide line으로 level을 구분한다. Row click은 `AppShell` heading navigation context를 통해 preview mode의 `data-outline-heading-id` target을 먼저 찾고, edit mode에서는 CodeMirror source line으로 스크롤하며, 등록된 navigator가 없을 때는 같은 outline target DOM fallback으로 스크롤한다. Preview mode에서 접힌 parent section 아래 child heading으로 이동할 때는 target DOM 조회 전에 ancestor fold key를 펼친 뒤 다시 조회해, 접힌 하위 heading outline click이 no-op이 되지 않게 한다.

Issue #48 이후 editor와 navigation source는 동작을 유지한 채 feature-local module로 분리되었다. `components/document-editor.tsx`는 `DocumentEditor` entrypoint와 editor state/orchestration을 맡고, `components/document-editor/` 아래의 `markdown-preview.tsx`, `document-properties.tsx`, `folding-storage.ts`, `preview-markdown.ts`, `wiki-link-suggestions.tsx`, `types.ts`가 preview, properties, folding, suggestion UI를 나눠 맡는다. `components/document-navigation.tsx`는 `DocumentNavigation` entrypoint와 container state/orchestration을 맡고, `components/document-navigation/` 아래의 panel, row, tree, favorites module이 sidebar rendering과 순수 helper를 나눠 맡는다.

## Document tabs and navigation toolbar

Issue #29 구현은 workspace editor 위에 Obsidian-style document tab strip과 navigation toolbar를 추가했다. Active document source of truth는 기존 `?document=<id>` query로 유지된다. Sidebar link, sidebar search result link, preview wikilink는 계속 `?document=<id>`로 route한다. Issue #31에서 toolbar layout은 left navigation buttons, centered current path, right mode toggle의 3-column grid로 정리되어 path가 toolbar 중앙에 표시된다.

Tab strip은 workspace-scoped browser UI state를 `munjib:open-tabs:<workspaceSlug>` localStorage key에 저장하고, active tab instance는 별도 localStorage key로 관리한다. 탭 상태는 DB row를 만들지 않고, document별 separate unsaved editor buffer도 보존하지 않는다. 일반 document 선택은 현재 active tab의 document를 교체한다. 사용자가 마지막 tab 바로 오른쪽의 `+` button으로 빈 tab을 만들거나 sidebar document row의 `...` menu에서 Open in new tab을 선택한 경우에만 새 tab instance를 추가한다. Tab width는 row 폭을 측정해 고정 폭으로 시작하고, tab 수가 row를 채우면 전체 tab width를 줄여 `+` button이 tab strip 끝에 붙어 있게 한다. Minimum tab width까지 줄어든 뒤에도 row를 넘는 tab은 horizontal scroll로 접근할 수 있다. Workspace root URL로 진입했고 `document`/`folder` query가 없지만 readable stored active tab이 있는 경우, center shell은 graph/empty-tab context가 아닐 때 해당 document URL로 replace navigation을 수행해 tab title과 server-rendered editor body가 같은 document를 가리키게 한다. Stale, deleted, or inaccessible `?document=` URLs are not replaced by the local stored tab.

Tab close는 active tab이 아니면 목록에서만 제거하고 현재 document/folder context를 유지한다. Active tab을 닫으면 오른쪽 tab, 왼쪽 tab, workspace root 순서로 다음 target을 고른다. Toolbar back/forward는 workspace center가 추적하는 document navigation history를 사용하며, forward 대상 document가 없거나 더 이상 readable하지 않으면 forward button을 비활성화한다. 현재 context path는 selected document의 `Document.path`, selected folder의 `Folder.path`, 또는 root `/`로 표시한다.

## Heading folding

Issue #25 구현은 Obsidian-style markdown heading folding을 document editor의 edit/preview mode에 추가했다. CodeMirror edit mode는 heading fold gutter를 제공하고, 문서 진입 시 저장된 heading fold state를 editor range로 복원한다. Editor update listener는 CodeMirror의 live document text에서 fold tree를 다시 만들고 folded range state를 heading body line range 또는 CodeMirror heading fold range와 matching해, 접기/펼치기 결과를 preview와 같은 raw heading key로 저장한다. Preview mode는 YAML frontmatter block을 계속 숨기고 wiki link preview rendering을 유지하면서 heading 왼쪽 chevron button으로 section을 접고 펼친다.

Preview chevron은 heading content flow 바깥에 absolute로 배치해 edit mode gutter처럼 본문 heading text를 밀어내지 않는다. 펼쳐진 heading은 hover/focus 때만 chevron을 보여주고, 접힌 heading은 chevron을 항상 보여준다. Chevron hover/focus는 배경색이나 border/ring을 입히지 않고 icon color만 바꾼다. Preview section은 heading level별 margin을 적용해 `#`, `##`, `###` 영역 간 visual grouping을 분리한다. 접힘 범위는 heading hierarchy를 따른다. `#` heading은 다음 `#` 전까지, `##` heading은 다음 `##` 또는 상위 heading 전까지 숨긴다. CRLF line ending을 쓰는 fenced code block 뒤의 heading도 folding 대상으로 인식한다. 접힘 상태는 문서별 browser `localStorage` key인 `munjib:heading-folds:<documentId>`에 저장되어 preview와 edit mode가 공유한다. Fold state는 browser UI state이므로 markdown 저장 payload나 DB 모델을 바꾸지 않는다.

Preview는 folding을 위해 heading이 있는 문서를 여러 `ReactMarkdown` chunk로 나누지만, frontmatter를 제거한 원문에서 Markdown reference link와 footnote definition block을 추출해 각 chunk에 붙인다. Definition marker line은 `[x]:`나 `[^one]:`처럼 첫 줄 content가 비어 있어도 definition으로 인정한다. Definition block에는 definition line 뒤의 indented/blank continuation line도 포함하므로, 뒤 section에 놓인 multi-line footnote나 reference definition도 앞 section의 reference link를 whole-document Markdown처럼 resolve한다. Heading이 없는 문서는 원문 전체를 한 번만 렌더링해 definition block을 중복 첨부하지 않는다. CRLF markdown line scan은 original offset을 보존하고, fenced code block 안의 reference-like text는 shared definition으로 수집하지 않는다.

## 근거

- `app/workspaces/[workspaceSlug]/page.tsx`
- `app/workspaces/[workspaceSlug]/actions.ts`
- GitHub issue #26
- `components/document-editor.tsx`
- `components/document-editor/ai-assistant-panel.tsx`
- `components/document-editor/markdown-preview.tsx`
- `components/document-editor/document-properties.tsx`
- `components/document-editor/folding-storage.ts`
- `components/document-editor/preview-markdown.ts`
- `components/document-editor/wiki-link-suggestions.tsx`
- `app/globals.css`
- `components/document-list.tsx`
- `components/document-navigation.tsx`
- `components/workspace-center-shell.tsx`
- `components/use-document-tabs.ts`
- `lib/document-tabs.ts`
- `components/document-navigation/search-panel.tsx`
- `components/app-shell.tsx`
- `components/document-navigation/favorites-panel.tsx`
- `components/document-navigation/document-row.tsx`
- `components/document-navigation/folder-row.tsx`
- `components/document-navigation/document-section.tsx`
- `components/document-navigation/favorites.ts`
- `components/document-navigation/tree.ts`
- `components/knowledge-graph-view.tsx`
- `components/folder-detail.tsx`
- `components/metadata-panel.tsx`
- `lib/workspace-tree.ts`
- `lib/workspace-routes.ts`
- `lib/knowledge-graph/model.ts`
- `lib/markdown/folding.ts`
- `lib/service-errors.ts`
- `lib/documents/service.ts`
- `lib/documents/import-markdown.ts`
- `lib/markdown/folding.ts`
- `lib/markdown/html-to-markdown.ts`
- `lib/wiki-links/preview.ts`
- GitHub issue #73
- `docs/superpowers/specs/2026-05-30-document-ai-rag-assistant-design.md`
- `docs/superpowers/specs/2026-06-06-langchain-langfuse-rag-provider-abstraction-design.md`
- `lib/rag/index-document.ts`
- `lib/attachments/service.ts`
- `tests/rag/index-document.test.ts`
- `tests/attachments/service.test.ts`
- `lib/comments/service.ts`
- `lib/document-metadata/display.ts`
- `lib/document-metadata/parser.ts`
- `lib/document-metadata/reconcile.ts`
- `prisma/schema.prisma`
- `tests/markdown/folding.test.ts`
- `tests/markdown/outline.test.ts`
- `tests/markdown/preview-styles.test.ts`
- `tests/workspace-actions.test.ts`
- `tests/components/metadata-panel.test.tsx`
- `tests/components/app-shell.test.tsx`
- `tests/components/document-editor-preview.test.tsx`
- `tests/e2e/preview-line-breaks.spec.ts`
- `tests/components/document-list.test.tsx`
- `tests/components/workspace-center-shell.test.tsx`
- `tests/documents/import-markdown.test.ts`
- `tests/components/knowledge-graph-view.test.tsx`
- `tests/wiki-links/preview.test.ts`
- `tests/e2e/login.spec.ts`
- GitHub issue #25
- GitHub issue #29
- GitHub issue #83
- GitHub issue #34
- `docs/superpowers/specs/2026-05-05-markdown-heading-folding-design.md`
- `docs/superpowers/specs/2026-05-11-document-tabs-navigation-toolbar-design.md`
- `docs/superpowers/specs/2026-05-16-metadata-panel-outline-design.md`
- Issue #25 final review blocker fix
