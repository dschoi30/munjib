---
id: concept-wiki-links-and-backlinks
title: Wiki Links And Backlinks
type: concept
status: active
summary: Munjib의 Obsidian-style wiki link 파싱, backlink, broken link 저장 방식.
created: 2026-04-29
updated: 2026-04-29
source_count: 4
tags:
  - munjib
  - wiki-links
  - backlinks
links:
  - "[[Munjib]]"
  - "[[Document Knowledge Model]]"
  - "[[Document Editing Workflow]]"
---

# Wiki Links And Backlinks

Munjib의 link model은 Markdown 안의 `[[문서명]]` 구문을 `DocumentLink` row로 정규화한다. 이 row가 outgoing links, backlinks, broken links panel의 근거가 된다.

## 파싱 규칙

`lib/wiki-links/parser.ts`의 `parseWikiLinks()`는 다음 형태를 인식한다.

- `[[Target Title]]`
- `[[Target Title|Alias]]`

현재 파서는 다음 항목을 제외한다.

- embed link: `![[...]]`
- 빈 target
- `[[#Heading]]`처럼 heading-only link
- 같은 source 문서 안에서 대소문자만 다른 중복 target

Alias는 `|` 뒤의 문자열이 비어 있지 않을 때만 저장된다.

## Reconciliation

`reconcileDocumentLinks()`는 문서 생성/수정 후 실행된다.

1. source 문서의 기존 `DocumentLink` row를 삭제한다.
2. 최신 markdown에서 wiki links를 다시 파싱한다.
3. target title을 `slugifyTitle()`로 slug화한다.
4. 같은 workspace 안의 active document 중 target slug와 일치하는 문서를 찾는다.
5. 대상이 있으면 `targetDocumentId`를 채우고 `isBroken=false`로 저장한다.
6. 대상이 없으면 `targetDocumentId=null`, `isBroken=true`로 저장한다.

이 방식은 update 시 link 상태가 source markdown과 항상 다시 맞춰지도록 단순하게 만든다.

## Backlinks

Backlink는 별도 텍스트 검색이 아니라 `DocumentLink.targetDocumentId`를 통해 계산된다. 현재 문서를 target으로 갖는 link의 source document 목록이 backlink panel에 표시된다.

## Broken link에서 문서 생성

`createDocumentFromBrokenLink()`는 broken link row를 기준으로 새 문서를 만든다. 새 문서 title은 `targetTitleRaw`이고 초기 markdown은 생성 안내 문구를 포함한다. 생성 후 `repairBrokenLinksForTarget()`이 같은 workspace 안에서 같은 `targetTitleRaw`를 가진 broken links를 새 문서로 연결한다.

## 현재 한계

- 문서 title 변경 시 기존 markdown text 자체를 자동 rewriting하지는 않는다.
- heading/block link는 아직 본격 지원하지 않는다.
- embed syntax는 현재 link graph에서 제외된다.

## 근거

- `lib/wiki-links/parser.ts`
- `lib/wiki-links/reconcile.ts`
- `lib/wiki-links/service.ts`
- `lib/documents/service.ts`
