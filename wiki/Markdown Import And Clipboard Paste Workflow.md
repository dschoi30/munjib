---
id: workflow-markdown-import-clipboard-paste
title: Markdown Import And Clipboard Paste Workflow
type: workflow
status: active
summary: Markdown file import와 editor clipboard paste가 문서, attachment, draft, version 흐름에 반영되는 방식.
created: 2026-05-21
updated: 2026-05-24
source_count: 14
tags:
  - munjib
  - workflow
  - documents
  - markdown
  - clipboard
  - attachments
links:
  - "[[Document Editing Workflow]]"
  - "[[Document Knowledge Model]]"
  - "[[Wiki Links And Backlinks]]"
  - "[[Auth And Permissions Workflow]]"
---

# Markdown Import And Clipboard Paste Workflow

이 문서는 Markdown file import와 editor clipboard paste를 분리해서 설명한다. 두 흐름은 모두 문서 본문에 Markdown을 남기지만, persistence 시점과 attachment 처리 방식이 다르다.

## 핵심 차이

Markdown import는 새 document를 즉시 만든다. Imported file text가 곧 `Document.contentMarkdown`이 되고, `createDocument()` 흐름에서 initial version, link reconciliation, metadata reconciliation, `document.created` audit log가 같이 확정된다.

Import 직후 navigation은 server action `redirect()`를 쓰지 않는다. Issue #55 이후 Markdown import는 복수 file batch action으로 동작하고, import 완료 후에도 현재 route/document에 머문다. Settings panel은 `router.refresh()`로 document list를 갱신하고 panel 안에서 batch 결과를 보여준다.

Clipboard paste는 현재 editor draft를 먼저 바꾼다. Image paste는 attachment row와 file storage를 먼저 만들 수 있지만, 본문의 image markdown persistence, document version, link/metadata reconciliation, `document.updated` audit log는 사용자가 Save를 누를 때 `updateDocument()`에서 확정된다.

## Markdown import

UI 진입점은 workspace settings dialog의 `Import` menu다. `components/workspace-settings-panel.tsx`의 Markdown import form은 `importMarkdownAction` server action으로 제출된다. `components/document-list.tsx`는 settings panel open/close와 prop 전달만 담당한다.

`importMarkdownDocumentAction()`은 다음 순서로 동작한다.

1. `requireCurrentUser()`로 현재 user를 확인한다.
2. form의 repeated `markdownFiles` field에서 File 목록을 읽는다. 이전 단일 caller 호환을 위해 `markdownFile` fallback도 지원한다.
3. file이 하나도 없으면 `MARKDOWN_IMPORT_FILE_REQUIRED`를 throw한다.
4. form의 `folderId`가 있으면 batch 전체 destination folder로 사용하고, 없으면 workspace root로 import한다.
5. 각 file마다 size 0이면 failed row에 `MARKDOWN_IMPORT_FILE_REQUIRED`를 기록하고 계속한다.
6. `isSupportedMarkdownImportFile()`로 `.md`, `.markdown`, `text/markdown`, `text/x-markdown`만 허용한다. Unsupported file은 failed row에 `MARKDOWN_IMPORT_UNSUPPORTED_FILE`을 기록하고 계속한다.
7. valid file은 `file.text()`를 읽어 원문 Markdown을 그대로 `contentMarkdown`으로 사용한다.
8. `deriveMarkdownImportTitle()`로 제목을 정하고 `createDocument()`를 호출한다.
9. workspace route를 한 번 revalidate하고 `{ documentIds, imported, failed }` batch result를 반환한다.
10. Settings panel은 dialog를 닫거나 route를 바꾸지 않고 `router.refresh()`로 list를 갱신한다.

Title 우선순위는 YAML frontmatter `title`, 첫 번째 ATX `# Heading`, 확장자를 제거한 file name, 마지막으로 `Untitled`다. YAML block scalar marker인 `title: |`, `title: >`는 title 후보에서 제외한다. 첫 H1 scan은 fenced code block 안의 `# ...` line을 건너뛴다.

Import는 attachment upload를 별도로 하지 않는다. Markdown 안에 이미 `![alt](url)` 또는 `![alt](/api/attachments/...)`가 있으면 그 text를 그대로 문서 본문으로 저장한다. 따라서 import된 Markdown의 이미지가 보이는지는 URL이 브라우저에서 접근 가능한지, 또는 이미 Munjib attachment URL을 가리키는지에 달려 있다.

## Multiple-file Markdown import

Issue #55는 workspace settings Import form이 여러 Markdown file을 한 번에 선택하고 가져오는 흐름이다. 설계 근거는 `docs/superpowers/specs/2026-05-23-multiple-markdown-file-import-design.md`이고 구현 계획은 `docs/superpowers/plans/2026-05-24-multiple-markdown-file-import.md`이다.

Implemented behavior:

- Native file input styling은 감추고, 기존 dashed import form 영역을 클릭하면 file picker가 열린다.
- File input은 `multiple`을 지원한다.
- 선택한 file 목록은 table로 표시하고 각 row는 `Ready`, `Importing`, `Imported`, `Failed` status를 가진다.
- Submit row는 약 2/3 너비의 bordered destination path 영역과 더 좁은 Import button으로 나뉜다.
- Destination path는 기본으로 workspace root를 표시하며, 사용자가 선택하지 않으면 root에 import한다.
- Destination path 영역을 클릭하면 popup tree가 열리고 root 또는 folder path를 선택한다. 선택한 folder는 batch 전체의 `folderId`로 server action에 전달한다.
- Import 완료 후 settings panel은 닫지 않고 현재 document route도 바꾸지 않는다.
- 성공 후 document list refresh만 수행해 새 문서가 navigation에 나타나게 한다.
- 진행 중, 완료, 실패 또는 부분 실패는 global Sonner 위치를 바꾸지 않고 settings panel 중앙의 toast-like local status message로 표시한다.
- Server action은 repeated `markdownFiles` field를 batch로 처리하되 기존 단일 `markdownFile` caller도 호환한다.
- Missing all files는 기존처럼 `MARKDOWN_IMPORT_FILE_REQUIRED`를 throw하고, empty/unsupported 개별 file은 batch result의 failed row로 보고해 유효한 file import를 계속한다.
- 같은 basename file이 섞인 partial result는 fileName별 result count를 소비하는 방식으로 row status를 매칭해 duplicate name이 모두 같은 status로 표시되지 않게 한다.

## Clipboard paste dispatch

`DocumentEditor`의 CodeMirror paste handler는 다음 순서로 clipboard를 판정한다.

1. `DataTransfer.items` 또는 `DataTransfer.files`에서 `image/png`, `image/jpeg`, `image/gif`, `image/webp` file을 찾는다.
2. image file이 있으면 rich HTML 변환보다 먼저 paste-only attachment upload 경로를 탄다.
3. image file이 없으면 clipboard `text/html`을 읽고 HTML-to-Markdown 변환을 수행한다.
4. HTML 안의 `<img>`는 Markdown 변환 전에 upload placeholder로 치환한다.
5. 이미지가 없는 HTML은 rich text paste로 처리한다.
6. HTML 변환 결과가 없으면 browser/CodeMirror 기본 plain text paste에 맡긴다.

이 순서 때문에 source app이 clipboard에 실제 image file을 제공하는 경우와 `<img src>` HTML만 제공하는 경우가 서로 다른 하위 경로를 탄다.

## Clipboard image file paste

Clipboard에 image file blob이 있으면 `DocumentEditor`는 현재 selection에 `![Uploading image...](about:blank#munjib-paste-...)` placeholder를 동기 삽입한다. 동시에 paste 전 selection text를 저장해 upload 실패 시 원래 선택 내용을 복구할 수 있게 한다.

그 다음 `pasteImageAttachmentAction` prop으로 bind된 `pasteDocumentImageAttachmentAction()`을 호출한다. Server action은 `documentId`와 `attachment` file을 받아 `uploadPastedDocumentImageAttachment()`로 넘긴다.

`uploadPastedDocumentImageAttachment()`는 다음만 수행한다.

- workspace/document write permission 확인
- image MIME type과 5MB size limit 확인
- `storage/attachments/<workspaceId>/<uuid>-<safeFileName>`에 file 저장
- `Attachment` row 생성
- `attachment.uploaded` audit log 작성
- editor insertion용 `![file](/api/attachments/<id>)` 반환

이 경로는 `Document.contentMarkdown`, `DocumentVersion`, document link reconciliation, metadata reconciliation을 즉시 변경하지 않는다.

## Clipboard HTML image paste

Clipboard에 image file은 없고 HTML 안에 `<img src>`만 있는 경우가 있다. 예를 들어 일부 browser/app은 이미지를 실제 File로 주지 않고 `<a href="source"><img src="remote-or-data-url"></a>` HTML fragment만 제공한다.

`DocumentEditor`는 HTML을 Markdown으로 바꾸기 전에 `<img>`를 upload placeholder text node로 치환한다. `<a>`가 image만 감싸는 wrapper라면 source link Markdown을 만들지 않고 wrapper 전체를 placeholder로 대체한다. 그래서 source URL만 붙여넣어지는 결과를 피한다.

HTML image source는 두 가지로 나뉜다.

- `data:image/...`: client에서 `File`로 변환해 `attachment` form field로 보낸다.
- remote `http(s)` URL: browser CORS를 피하기 위해 client에서 fetch하지 않고 `imageUrl`과 `fileName` form field를 server action에 보낸다.

Server action의 remote image fetch는 보안 제한을 둔다.

- `http:`와 `https:`만 허용한다.
- `localhost`, `.localhost`, private IPv4, loopback, link-local, carrier-grade NAT, multicast, private IPv6, link-local IPv6를 DNS lookup 결과 기준으로 거부한다.
- DNS rebinding을 피하기 위해 검증된 IP address에 직접 연결하고, 원래 hostname은 HTTPS SNI와 `Host` header로만 유지한다. 검증된 DNS answer가 여러 개면 첫 address 실패 시 다음 address를 순서대로 시도한다.
- redirect는 `redirect: "error"`로 차단한다.
- `AbortSignal.timeout(5_000)`으로 5초 timeout을 둔다.
- `image/png`, `image/jpeg`, `image/gif`, `image/webp`만 허용한다.
- `content-length`와 streaming read 모두 5MB limit을 적용한다.

서버가 image bytes를 얻은 뒤에는 image file paste와 같은 `uploadPastedDocumentImageAttachment()` 경로를 사용한다.

## Pending draft와 Save guard

Image paste upload가 pending인 동안 같은 document의 Save submit은 차단되고 `Image upload is still in progress` toast가 표시된다. Pending count는 document id별 map으로 관리한다. 여러 문서에서 동시에 image paste upload가 진행되어도 한 문서의 완료가 다른 문서의 Save guard를 해제하지 않는다.

Upload 결과는 source editor view가 속한 document draft에 적용된다. 사용자가 upload 중 다른 문서로 이동했다가 돌아와도 source document draft에 placeholder 교체 결과가 유지된다. Upload가 완료된 활성 문서는 pending draft cache를 지우고, 비활성 문서는 다시 열 때 한 번 반영한 뒤 cache를 지워 server-side content refresh가 stale draft에 가려지지 않게 한다.

## 실패 처리

Image paste upload가 실패하면 placeholder를 제거하거나 alt text로 되돌리고 `toast.error("Image paste failed")`를 표시한다. Clipboard image file paste는 paste 전에 선택되어 있던 text를 복구한다. HTML image paste는 `<img alt>` text 또는 `pasted-image` fallback을 사용한다.

Remote image URL fetch 실패, forbidden MIME type, private host, timeout, size limit 초과는 모두 upload 실패로 보이며 editor에는 실패 toast가 나타난다. Malformed 또는 unsupported `data:` image source는 form data 생성 단계에서 실패해도 async catch/finally 경로를 거쳐 pending count를 정리하므로 Save guard가 stuck 상태로 남지 않는다.

## 관련 코드

- `components/document-list.tsx`: workspace sidebar composition과 settings panel open/close.
- `components/workspace-settings-panel.tsx`: settings dialog Markdown import form, selected-file table, destination picker, panel status message.
- `app/workspaces/[workspaceSlug]/actions.ts`: `importMarkdownDocumentAction()`, `pasteDocumentImageAttachmentAction()`, remote image URL server fetch.
- `lib/documents/import-markdown.ts`: supported Markdown file 판정과 imported title derivation.
- `components/document-editor.tsx`: CodeMirror paste dispatch, image placeholder, pending draft/save guard.
- `lib/markdown/html-to-markdown.ts`: rich HTML semantic Markdown 변환.
- `lib/attachments/service.ts`: manual attachment upload와 paste-only image attachment upload.
- `tests/documents/import-markdown.test.ts`: import title/file validation.
- `tests/components/document-editor-preview.test.tsx`, `tests/workspace-actions.test.ts`, `tests/attachments/service.test.ts`: clipboard paste, server action, attachment service 검증.
