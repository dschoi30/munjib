# Real Folder Hierarchy Design

Date: 2026-05-04
Issue: #20 Real folder hierarchy

## Context

Munjib의 현재 `New folder` 동작은 실제 폴더를 만들지 않는다. `app/workspaces/[workspaceSlug]/actions.ts`의 `folder` template은 `Untitled folder` 제목과 빈 markdown을 가진 `Document`를 생성한다. `Document.parentId`와 `path` 필드는 schema에 존재하지만, 현재 생성/수정 흐름은 항상 루트 `/${slug}` 문서를 만들고 좌측 navigation도 flat document list에 가깝다.

목표는 Obsidian의 vault 경험에 더 가까운 실제 폴더 기반 계층 구조다. 사용자가 참고 링크로 제공한 Obsidian Hub beginner 페이지는 초심자에게 Obsidian, Markdown, vault 기반 사용 흐름을 안내하는 entry point이며, 이번 설계에서는 "문서는 폴더 안에 놓이는 markdown note이고, 폴더는 note가 아닌 컨테이너"라는 mental model을 우선한다.

## Chosen Approach

별도 `Folder` 모델을 추가한다.

`Folder`는 markdown content, version, document link, metadata, attachment, comment를 갖지 않는 컨테이너다. `Document`는 `folderId`로 위치를 갖고, workspace root에 놓인 문서는 `folderId=null`을 사용한다. 기존 `folder` template으로 생성하던 folder-like document 방식은 제거한다.

이 접근은 `Document`에 `NOTE/FOLDER` 타입을 추가하는 방식보다 migration과 UI 작업은 많지만, 폴더와 문서의 책임이 명확하다. 이후 폴더별 권한, import/export, drag-and-drop tree 같은 기능도 더 자연스럽게 확장할 수 있다.

## Data Model

새 모델:

- `Folder`
  - `id`
  - `workspaceId`
  - `parentFolderId`
  - `name`
  - `slug`
  - `path`
  - `status`
  - `createdById`
  - `updatedById`
  - `createdAt`
  - `updatedAt`
  - `archivedAt`

`Document` 변경:

- `folderId String?`
- `parentId` 기반 document tree는 새 folder hierarchy에서 사용하지 않는 방향으로 정리한다. migration 호환성 때문에 즉시 제거하지 않을 수 있지만 신규 흐름에서는 `folderId`가 위치의 source of truth다.
- `path`는 root 또는 folder path와 document slug를 결합한 location path다.

Unique constraints:

- Folder sibling name/slug는 같은 workspace와 같은 parent folder 안에서 unique여야 한다.
- Document title/slug는 같은 workspace와 같은 folder 안에서 unique여야 한다.
- Document title 중복은 서로 다른 folder 사이에서 허용한다.
- Document `path`는 workspace 안에서 unique여야 한다.
- Folder `path`도 workspace 안에서 unique여야 한다.

예시:

- `/operations`
- `/operations/onboarding`
- `/engineering/onboarding`

`/operations/onboarding`과 `/engineering/onboarding`은 둘 다 `Onboarding` 문서일 수 있다.

## Folder Operations

### Create

좌측 navigation에서 workspace root 또는 folder가 선택된 상태로 생성한다.

- `New folder`: 선택된 folder 아래 `Untitled folder` folder를 만든다.
- `New document`: 선택된 folder 아래 document를 만든다.
- root가 선택되거나 선택 folder가 없으면 root에 생성한다.

문서 생성은 기존 template(`blank`, `runbook`, `policy`)을 유지하되 `folderId`를 받는다.

### Rename

Folder rename은 해당 folder의 `name`, `slug`, `path`를 갱신하고 모든 descendant folder/document path를 재계산한다. Document rename은 현재 document의 `title`, `slug`, `path`를 갱신한다. 두 경우 모두 audit log metadata에 previous path와 new path를 남긴다.

### Move

Folder move는 parent folder를 바꾸고 subtree path를 재계산한다. 자기 자신이나 descendant 아래로 이동하는 cycle은 거부한다. Document move는 `folderId`를 바꾸고 document path를 재계산한다.

Move는 같은 parent 안의 slug 충돌을 거부하거나 next-available slug를 제안해야 한다. MVP에서는 silent rename보다 명시적 충돌 오류가 더 안전하다.

### Archive

비어 있지 않은 folder archive는 차단한다. 사용자는 먼저 하위 folder/document를 이동하거나 archive해야 한다.

MVP에서 recursive archive/restore는 제외한다. 이 정책은 accidental subtree disappearance, 대량 audit log, archived descendant link behavior를 피하기 위한 범위 제한이다.

## Link Resolution

서로 다른 folder에 같은 title의 document가 있을 수 있으므로 wiki link resolution은 title-only slug lookup만으로 충분하지 않다.

지원 규칙:

- `[[Operations/Onboarding]]` 같은 path-qualified link는 path 기준으로 정확히 resolve한다.
- `[[Operations/Onboarding|Onboarding]]`은 정확한 target으로 연결하면서 label은 alias를 사용한다.
- `[[Onboarding]]` 같은 title-only link가 active readable document 하나와만 일치하면 resolve한다.
- title-only link가 여러 active readable document와 일치하면 ambiguous/unresolved로 남긴다. Preview는 임의 target을 만들지 않고 plain text fallback으로 렌더링한다.
- Broken link와 ambiguous link는 같은 "resolved target 없음" 상태이지만 원인이 다르므로 UI와 저장 모델에서 구분할 수 있어야 한다.

Autocomplete:

- 중복 title이 없는 후보는 기존처럼 title label을 보여도 된다.
- 중복 title이 있는 후보는 `Operations/Onboarding`, `Engineering/Onboarding`처럼 path-qualified label을 보여준다.
- 중복 title 후보를 선택하면 path-qualified target을 삽입한다. 짧은 label이 필요하면 alias 형태를 사용할 수 있다.

Relative wikilinks(`[[../Operations/Onboarding]]`)와 heading/block link는 MVP 범위에서 제외한다.

## Permissions

MVP에서 folder-specific permission과 inherited ACL은 제외한다.

- Folder create, rename, move, archive는 workspace write 권한을 요구한다.
- Document read/write는 기존 workspace role 및 document explicit permission 규칙을 유지한다.
- Folder는 document explicit permission을 상속시키지 않는다.
- Folder tree에 표시되는 document는 기존 permission filter를 통과해야 한다.

이 범위는 기존 `Permission(resourceType=DOCUMENT)` 모델을 유지하면서 folder hierarchy 자체를 먼저 안정화하기 위한 결정이다.

## UI

좌측 sidebar는 flat document list에서 vault tree로 바뀐다.

Tree behavior:

- workspace root, folder, document row를 구분한다.
- folder는 expand/collapse, rename, move, archive, create child actions를 갖는다.
- document는 기존 editor open behavior를 유지한다.
- search 결과와 quick switcher는 duplicate title 구분을 위해 path label을 함께 보여준다.
- favorites/recent는 document 중심 기능으로 유지한다. Folder favorite은 MVP에서 제외한다.

Folder를 선택했을 때 editor panel은 markdown editor가 아니라 folder detail/empty state를 보여준다. 여기에는 child create action과 path, child count, archive 가능 여부를 표시한다.

## Migration

기존 folder-like document는 자동 변환하지 않는다. 현재 seed/test data와 사용자 데이터에는 "빈 document가 실제 folder였다"는 신뢰 가능한 marker가 없기 때문이다. `Untitled folder` 제목과 빈 content만으로 변환하면 사용자가 실제로 만든 빈 문서를 잘못 folder로 바꿀 수 있다.

MVP migration은 다음만 수행한다.

- 새 `Folder` table 생성
- `Document.folderId` 추가
- 기존 document는 root document로 유지
- 기존 `Document.path`는 root path로 유지 또는 재계산
- 이후 UI의 `New folder`는 `Folder`만 생성

필요하면 별도 follow-up에서 수동 migration/admin tool을 설계한다.

## Testing

Focused tests:

- Folder create/rename/move/archive guard service tests
- Document create/update/move path uniqueness tests
- Duplicate title allowed across folders and rejected within same folder
- Path-qualified wiki link reconciliation and preview tests
- Ambiguous title-only link remains unresolved
- Permission filtering in tree/search/link panels
- E2E smoke: create folder, create document under folder, rename/move, verify path labels and preview link behavior

Existing tests affected:

- `tests/documents/service.test.ts`
- `tests/wiki-links/reconcile.test.ts`
- `tests/wiki-links/preview.test.ts`
- `tests/e2e/login.spec.ts`

## Wiki Maintenance Requirements

This feature changes durable project knowledge. The implementation plan must include updates to:

- `wiki/Folder Hierarchy Model.md`
- `wiki/Document Knowledge Model.md`
- `wiki/Document Editing Workflow.md`
- `wiki/Wiki Links And Backlinks.md`
- `wiki/Auth And Permissions Workflow.md`
- `wiki/index.md`
- `wiki/manifest.json`
- `wiki/log.md`

Before commit, run:

- `pnpm wiki:manifest`
- `pnpm wiki:lint`
- `pnpm wiki:sync-check --staged`

## Out Of Scope

- Folder-specific permissions
- Inherited folder ACLs
- Recursive archive/restore
- Filesystem import/export
- Relative path wikilinks
- Drag-and-drop tree UI
- Folder favorites

## Open Questions

No blocking open questions remain for the first implementation plan. Later specs may revisit folder permissions, recursive archive/restore, relative links, and import/export.
