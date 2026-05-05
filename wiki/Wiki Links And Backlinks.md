---
id: concept-wiki-links-and-backlinks
title: Wiki Links And Backlinks
type: concept
status: active
summary: Munjib의 Obsidian-style wiki link 파싱, backlink, broken link 저장 방식.
created: 2026-04-29
updated: 2026-05-05
source_count: 19
tags:
  - munjib
  - wiki-links
  - backlinks
links:
  - "[[Munjib]]"
  - "[[Document Knowledge Model]]"
  - "[[Folder Hierarchy Model]]"
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

Issue #20 구현에서는 서로 다른 folder에 같은 document title을 허용하므로 path-qualified wikilink를 지원한다. 예를 들어 `[[Operations/Onboarding]]`은 `/operations/onboarding` 문서를 가리키고, `[[Operations/Onboarding|Onboarding]]`은 같은 target에 짧은 label을 붙인다.

## Reconciliation

`reconcileDocumentLinks()`는 문서 생성/수정 후 실행된다.

1. source 문서의 기존 `DocumentLink` row를 삭제한다.
2. 최신 markdown의 YAML frontmatter `links:` 배열에서 wiki links를 다시 파싱한다.
3. target이 path-qualified인지 title-only인지 판단한다.
4. path-qualified target은 각 path segment를 slug로 정규화한 뒤 workspace 안의 active document `path`로 먼저 찾는다. 예를 들어 `[[Operations/Incident Runbook]]`은 `/operations/incident-runbook`으로 resolve한다.
5. path match가 없으면 slash가 포함된 target도 title fallback을 시도한다. `[[Q1/Q2 Plan]]`처럼 title 자체에 `/`가 들어간 문서는 root title link로 계속 resolve할 수 있다.
6. title-only target은 readable active document 중 title slug가 일치하는 후보를 찾는다.
6. 후보가 하나면 `targetDocumentId`를 채우고 `isBroken=false`로 저장한다.
7. 후보가 없으면 broken link로 저장한다.
8. 후보가 여러 개면 `isAmbiguous=true`, `isBroken=false`, `targetDocumentId=null`로 저장하고 임의 target을 선택하지 않는다.

본문 content 영역의 `[[...]]`는 preview navigation 대상으로는 렌더링하지만 Properties Links row와 backlink graph의 `DocumentLink` edge로 저장하지 않는다. `DocumentLink.sortOrder`는 YAML `links:` 배열 순서를 보존해 Properties Links row가 markdown 파일 순서와 일치하도록 한다.

이 방식은 create, update, version restore, attachment upload 후 link 상태가 source markdown의 frontmatter links와 항상 다시 맞춰지도록 단순하게 만든다.

## Autocomplete

`DocumentEditor`는 Markdown editor에서 active wiki link completion을 감지한다. `[[` 뒤의 query가 현재 cursor 위치와 맞으면 workspace 안의 후보 문서를 최대 6개까지 보여준다. 현재 문서 자신은 후보에서 제외한다.

Issue #20 이후 autocomplete는 `getWikiLinkCompletionOptions()`를 통해 title과 path target을 함께 검색한다. 같은 title의 후보가 하나뿐이면 `[[Title]]`을 삽입하고, duplicate title 후보가 있으면 folder path를 포함한 label을 보여주며 path-qualified target을 삽입한다. 예를 들어 `/operations/onboarding` 후보는 `Operations/Onboarding` label과 `[[Operations/Onboarding]]` insert text를 사용한다.

## Preview link rendering

Markdown preview는 `[[Target Title]]`과 `[[Target Title|Alias]]`를 Obsidian-style navigation link로 렌더링한다. `lib/wiki-links/preview.ts`는 workspace에서 읽을 수 있는 문서 후보를 title slug 기준으로 찾고, 일치하는 target은 `?document=<id>` link로 바꾼다. Alias가 있으면 link label은 alias를 사용한다.

아직 matching document가 없는 target은 navigation target을 만들 수 없으므로 대괄호 없는 plain text label로 보여준다. Title slug가 여러 readable document와 충돌하면 preview는 임의 target을 고르지 않고 plain text로 표시한다. Stored document slug와 정확히 일치하는 target은 충돌 상황에서도 해당 document로 연결한다.

Issue #20 이후 preview는 path-qualified link를 document path로 resolve한다. Title-only link가 여러 readable active document와 충돌하면 ambiguous link로 보고 plain text fallback을 유지한다. Preview candidate map은 slug collision에서도 임의 target을 고르지 않으며, path-qualified key는 `/`를 제거하고 segment별 slug 정규화를 거친 path로 찾는다. Path key가 없으면 title slug fallback을 시도해 slash-containing title link를 보존한다.

Embed syntax, escaped wiki links, inline/fenced code, indented code block 안의 wiki link text는 preview 변환에서 제외한다. Inline code는 backtick delimiter 길이를 맞춰 닫을 때만 code span을 종료하고, line ending을 포함하는 code span 상태도 문서 변환 중 유지한다. Fenced code는 opening fence의 marker와 width를 보존해 더 짧은 fence line 때문에 code block을 조기 종료하지 않는다.

Preview 변환은 후보 문서 title slug map을 caller에서 memoize해 전달받는다. Preview mode에서 editor keystroke마다 전체 후보 목록을 다시 slugify하지 않도록 하기 위한 UI 성능 guardrail이다.

Issue #25 preview surface는 wiki-link rendering과 heading folding을 같은 markdown preview 경로에서 적용한다. Fold key는 frontmatter를 제거한 raw markdown 기준으로 만들어 preview와 edit mode가 `munjib:heading-folds:<documentId>` localStorage state를 공유한다. Wiki-link conversion은 heading/body chunk가 `ReactMarkdown`에 전달되기 전에 적용되므로, 접힌 section을 다시 펼쳤을 때도 내부 wiki link는 기존 preview navigation 동작을 유지한다.

## Backlinks

Backlink는 별도 텍스트 검색이 아니라 `DocumentLink.targetDocumentId`를 통해 계산된다. 현재 문서를 target으로 갖는 frontmatter link의 source document 목록은 local graph와 metadata panel 쪽 관계 정보에 사용하지만, Properties Links row에는 현재 문서의 YAML `links:` outgoing만 표시한다.

`getDocumentLinkPanels()`는 outgoing target과 backlink source document에 대해 document-level explicit permission을 반영한다. 사용자가 읽을 수 없는 target/source 문서는 link panel에서 제외된다.

## Broken link에서 문서 생성

`createDocumentFromBrokenLink()`는 broken link row를 기준으로 새 문서를 만든다. 새 문서 title은 `targetTitleRaw`이고 초기 markdown은 빈 문자열이다. 생성 후 `repairBrokenLinksForTarget()`이 같은 workspace 안에서 같은 `targetTitleRaw`를 가진 broken links를 새 문서로 연결한다.

Issue #20 이후 broken link target이 `Operations/Incident Runbook`처럼 path-qualified이고 parent folder path(`/operations`)가 존재하면, 마지막 segment(`Incident Runbook`)를 title로 사용해 해당 folder 아래 문서를 생성한다. 이렇게 만들어진 문서는 `/operations/incident-runbook` path를 가져 다음 reconciliation에서도 같은 path-qualified link가 계속 resolve된다. Parent folder path가 없으면 target 전체를 slash-containing title로 보고 root 문서로 만든다.

UI에서는 broken link를 별도 panel이 아니라 Properties의 links row에 함께 표시한다. 정상 outgoing link는 보라색 link로, broken outgoing link는 연한 회색 underline button으로 보여 시각적으로 구분한다.

## 현재 한계

- 문서 title 변경 시 기존 markdown text 자체를 자동 rewriting하지는 않는다.
- heading/block link는 아직 본격 지원하지 않는다.
- embed syntax는 현재 link graph에서 제외된다.
- title rename 시 markdown 안의 `[[Old Title]]` text를 자동 rewriting하지는 않는다. 기존 `DocumentLink` edge는 target document id 기반으로 유지될 수 있지만 source markdown은 사용자가 수정해야 한다.

## 근거

- `lib/wiki-links/parser.ts`
- `lib/wiki-links/reconcile.ts`
- `lib/wiki-links/targets.ts`
- `lib/wiki-links/service.ts`
- `lib/wiki-links/autocomplete.ts`
- `lib/wiki-links/preview.ts`
- `lib/wiki-links/types.ts`
- `lib/markdown/folding.ts`
- `lib/documents/service.ts`
- `components/document-editor.tsx`
- `tests/components/document-editor-preview.test.tsx`
- `tests/wiki-links/preview.test.ts`
- `tests/wiki-links/reconcile.test.ts`
- `tests/wiki-links/autocomplete.test.ts`
