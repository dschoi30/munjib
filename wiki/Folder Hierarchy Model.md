---
id: concept-folder-hierarchy-model
title: Folder Hierarchy Model
type: concept
status: active
summary: Issue #20에서 folder-like document creation을 실제 Folder 컨테이너와 path 기반 document hierarchy로 대체하는 설계 결정.
created: 2026-05-04
updated: 2026-05-04
source_count: 6
tags:
  - munjib
  - data-model
  - folders
  - hierarchy
links:
  - "[[Document Knowledge Model]]"
  - "[[Document Editing Workflow]]"
  - "[[Wiki Links And Backlinks]]"
  - "[[Auth And Permissions Workflow]]"
---

# Folder Hierarchy Model

Issue #20의 목표는 현재 folder-like document creation을 실제 folder 기반 계층 구조로 대체하는 것이다. 현재 `New folder`는 `Untitled folder` 제목과 빈 markdown을 가진 `Document`를 만들지만, 계획된 모델에서는 `Folder`가 별도 컨테이너이고 `Document`는 folder 아래에 위치하는 markdown note다.

## 확정 결정

- `Folder`는 별도 model이다.
- `Folder`는 markdown content, document version, wiki link, metadata, attachment, comment를 갖지 않는다.
- `Document`는 `folderId`로 위치를 갖는다. `folderId=null`이면 workspace root 문서다.
- 같은 folder 안에서는 folder/document slug가 unique해야 한다.
- 서로 다른 folder 사이에서는 같은 document title/slug를 허용한다.
- `path`는 workspace 안에서 folder/document location을 구분하는 unique 값이다.
- 비어 있지 않은 folder archive는 차단한다.
- Folder-specific permission과 inherited ACL은 MVP 범위에서 제외한다.

## Path와 duplicate title

서로 다른 folder에 같은 제목의 문서가 있을 수 있다.

- `/operations/onboarding`
- `/engineering/onboarding`

두 문서는 모두 `Onboarding` title을 가질 수 있다. 따라서 문서의 identity는 workspace-wide slug가 아니라 folder path를 포함한 `path`로 판단한다.

## Wiki link 영향

Duplicate title을 허용하면 `[[Onboarding]]` 같은 title-only link가 모호해질 수 있다. Issue #20 설계는 다음 규칙을 사용한다.

- `[[Operations/Onboarding]]` 같은 path-qualified link는 정확한 document path로 resolve한다.
- `[[Operations/Onboarding|Onboarding]]`은 같은 target에 alias label을 붙인다.
- `[[Onboarding]]`이 하나의 active readable document와만 일치하면 resolve한다.
- `[[Onboarding]]`이 여러 active readable document와 일치하면 ambiguous/unresolved 상태로 남기고 임의 target을 고르지 않는다.

Autocomplete는 duplicate title 후보를 path label로 보여주고 path-qualified target을 삽입해야 한다.

## 권한

Folder create, rename, move, archive는 workspace write 권한을 요구한다. Folder-specific permission과 descendant inheritance는 MVP에서 다루지 않는다.

기존 `Permission(resourceType=DOCUMENT)` 규칙은 문서 read/write에만 적용된다. Folder tree는 사용자가 읽을 수 있는 document만 표시해야 한다.

## Archive 정책

비어 있지 않은 folder archive는 거부한다. 사용자는 먼저 하위 folder/document를 이동하거나 archive해야 한다. Recursive archive/restore는 follow-up 기능으로 둔다.

## 구현 계획에 포함할 항목

- Prisma `Folder` model과 `Document.folderId` 추가.
- folder/document path 계산 helper 추가.
- folder create, rename, move, archive service 추가.
- document create/update/move를 folder-aware하게 변경.
- sidebar를 flat list에서 folder/document tree로 변경.
- path-qualified wikilink reconciliation, preview, autocomplete 추가.
- ambiguous link 상태 저장 또는 표시 방식 추가.
- 관련 wiki page와 manifest/log 업데이트.

구현 계획은 `docs/superpowers/plans/2026-05-05-real-folder-hierarchy.md`에 저장되어 있다. 계획은 schema, folder service, folder-aware document service, path-qualified wiki link, workspace tree UI, autocomplete, seed/wiki verification 순서로 작업을 나눈다.

## 근거

- GitHub issue #20
- `docs/superpowers/specs/2026-05-04-real-folder-hierarchy-design.md`
- `docs/superpowers/plans/2026-05-05-real-folder-hierarchy.md`
- `prisma/schema.prisma`
- `lib/documents/service.ts`
- Obsidian Hub beginner guide: https://publish.obsidian.md/hub/04%20-%20Guides%2C%20Workflows%2C%20%26%20Courses/for%20Beginners
