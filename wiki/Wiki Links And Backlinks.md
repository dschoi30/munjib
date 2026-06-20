---
id: concept-wiki-links-and-backlinks
title: Wiki Links And Backlinks
type: concept
status: active
summary: Munjib의 Obsidian-style wiki link 파싱, backlink, broken link 저장 방식.
created: 2026-04-29
updated: 2026-06-20
source_count: 29
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

YAML frontmatter `links:` 배열은 위 wiki-link syntax와 plain title string을 모두 internal document link 후보로 취급한다. 예를 들어 `links: ["Runbook"]`은 alias 없는 `Runbook` target으로 저장되고, `links: ["[[Runbook|the runbook]]"]`은 alias를 보존한다. Plain title string은 기존 target resolution 규칙을 그대로 타므로 title-only, path-qualified, underscore-compatible matching이 동일하게 적용된다.

현재 파서는 다음 항목을 제외한다.

- embed link: `![[...]]`
- 빈 target
- `[[#Heading]]`처럼 heading-only link
- frontmatter `links:`의 external URL-like value와 Markdown external link value
- 같은 source 문서 안에서 대소문자만 다른 중복 target

Alias는 `|` 뒤의 문자열이 비어 있지 않을 때만 저장된다.

Issue #20 구현에서는 서로 다른 folder에 같은 document title을 허용하므로 path-qualified wikilink를 지원한다. 예를 들어 `[[Operations/Onboarding]]`은 `/operations/onboarding` 문서를 가리키고, `[[Operations/Onboarding|Onboarding]]`은 같은 target에 짧은 label을 붙인다.

## Reconciliation

`reconcileDocumentLinks()`는 문서 생성/수정 후 실행된다.

1. source 문서의 기존 `DocumentLink` row를 삭제한다.
2. 최신 markdown의 YAML frontmatter `links:` 배열에서 `[[...]]` wiki links와 plain title strings를 다시 파싱한다.
3. target이 path-qualified인지 title-only인지 판단한다.
4. path-qualified target은 각 path segment를 slug로 정규화한 뒤 workspace 안의 active document `path`로 먼저 찾는다. 예를 들어 `[[Operations/Incident Runbook]]`은 `/operations/incident-runbook`으로 resolve한다.
5. path match가 없으면 slash가 포함된 target도 title fallback을 시도한다. `[[Q1/Q2 Plan]]`처럼 title 자체에 `/`가 들어간 문서는 root title link로 계속 resolve할 수 있다.
6. title-only target은 readable active document 중 title slug가 일치하는 후보를 찾는다.
6. 후보가 하나면 `targetDocumentId`를 채우고 `isBroken=false`로 저장한다.
7. 후보가 없으면 broken link로 저장한다.
8. 후보가 여러 개면 `isAmbiguous=true`, `isBroken=false`, `targetDocumentId=null`로 저장하고 임의 target을 선택하지 않는다.

본문 content 영역의 `[[...]]`는 preview navigation 대상으로 렌더링하고 workspace graph view의 graph-only edge 후보로도 사용하지만, Properties Links row와 backlinks의 `DocumentLink` edge로 저장하지 않는다. `DocumentLink.sortOrder`는 YAML `links:` 배열 순서를 보존해 Properties Links row가 markdown 파일 순서와 일치하도록 한다.

이 방식은 create, update, version restore, attachment upload 후 link 상태가 source markdown의 frontmatter links와 항상 다시 맞춰지도록 단순하게 만든다.

Issue #65 이후 target resolution 규칙은 `lib/wiki-links/resolve.ts`의 순수 helper `resolveWikiLinkTarget()`에 모여 있다. Reconciliation은 이 helper를 호출해 기존 `DocumentLink` 저장 의미를 유지하고, graph 전용 full-markdown link construction도 같은 path-qualified, underscore-aware, ambiguous/broken 판정 규칙을 재사용할 수 있다.

Target 문서가 나중에 생성되거나 title/path/folder 위치가 바뀌는 경우에도 `repairResolvableBrokenLinksForTarget()`이 workspace 안의 기존 broken `DocumentLink` rows를 같은 resolver로 다시 평가한다. Repair 후보는 source document의 현재 frontmatter `links:` 배열에 같은 `targetTitleRaw`가 아직 있을 때만 인정한다. 현재 active target set에서 특정 target document 하나로 resolve되는 broken row는 `targetDocumentId`를 채우고 `isBroken=false`로 고쳐, source 문서를 다시 저장하지 않아도 outgoing link와 backlink가 살아난다.

Issue #59는 wiki link target matching에서 underscore를 공백처럼 취급하도록 frontmatter reconciliation과 preview rendering을 함께 조정했다. 예를 들어 `[[수에즈_운하_위기]]`는 `수에즈 운하 위기` 문서로 resolve되지만, source markdown과 `DocumentLink.targetTitleRaw`의 raw target text는 rewrite하지 않는다. 이 규칙은 path-qualified target의 각 segment에도 적용하되 document slug/path 생성 규칙 자체는 바꾸지 않는다.

한글처럼 global slug 생성에서 보존되지 않는 title은 wiki-link lookup 전용 Unicode-preserving key로 비교한다. 이 key는 기존 slug-compatible matching과 맞도록 punctuation을 제거하고 hyphen run을 접어 `[[Q1Q2 Plan]]`이 `Q1/Q2 Plan` 문서와, `[[A - B]]`가 `A-B` 문서와 계속 매칭되게 한다. Path-qualified target은 먼저 underscore를 공백으로 취급한 뒤 `slugifyTitle()`로 만든 stored path key와 비교한다. 마지막 path segment가 `untitled`처럼 title 정보를 잃는 경우 parent path는 같은 stored path key로 유지하고 마지막 title segment만 Unicode-preserving lookup key로 비교해 resolve한다. 그래서 `[[Project_Plans/Roadmap]]`은 `Project Plans` folder 아래 `Roadmap` 문서를, `[[역사/수에즈_운하_위기]]`는 `/untitled/untitled` path에 저장된 `역사` folder 아래 `수에즈 운하 위기` 문서를 찾을 수 있다.

## Autocomplete

`DocumentEditor`는 Markdown editor에서 active wiki link completion을 감지한다. `[[` 뒤의 query가 현재 cursor 위치와 맞으면 workspace 안의 후보 문서를 최대 6개까지 보여준다. 현재 문서 자신은 후보에서 제외한다.

Issue #20 이후 autocomplete는 `getWikiLinkCompletionOptions()`를 통해 title과 path target을 함께 검색한다. 같은 title의 후보가 하나뿐이면 `[[Title]]`을 삽입하고, duplicate title 후보가 있으면 folder path를 포함한 label을 보여주며 path-qualified target을 삽입한다. 예를 들어 `/operations/onboarding` 후보는 `Operations/Onboarding` label과 `[[Operations/Onboarding]]` insert text를 사용한다.

## Preview link rendering

Markdown preview는 `[[Target Title]]`과 `[[Target Title|Alias]]`를 Obsidian-style navigation link로 렌더링한다. `lib/wiki-links/preview.ts`는 workspace에서 읽을 수 있는 문서 후보를 title slug 기준으로 찾고, 일치하는 target은 `?document=<id>` link로 바꾼다. Alias가 있으면 link label은 alias를 사용한다.

아직 matching document가 없는 target은 navigation target을 만들 수 없으므로 대괄호 없는 plain text label로 보여준다. Title slug가 여러 readable document와 충돌하면 preview는 임의 target을 고르지 않고 plain text로 표시한다. Stored document slug와 정확히 일치하는 target은 충돌 상황에서도 해당 document로 연결한다.

Issue #20 이후 preview는 path-qualified link를 document path로 resolve한다. Title-only link가 여러 readable active document와 충돌하면 ambiguous link로 보고 plain text fallback을 유지한다. Preview candidate map은 slug collision에서도 임의 target을 고르지 않으며, path-qualified key는 `/`를 제거하고 segment별 slug 정규화를 거친 path로 찾는다. Path key가 없으면 title slug fallback을 시도해 slash-containing title link를 보존한다.

Embed syntax, escaped wiki links, inline/fenced code, indented code block 안의 wiki link text는 preview 변환에서 제외한다. Inline code는 backtick delimiter 길이를 맞춰 닫을 때만 code span을 종료하고, line ending을 포함하는 code span 상태도 문서 변환 중 유지한다. Fenced code는 opening fence의 marker와 width를 보존해 더 짧은 fence line 때문에 code block을 조기 종료하지 않는다.

Preview 변환은 후보 문서 title slug map을 caller에서 memoize해 전달받는다. Preview mode에서 editor keystroke마다 전체 후보 목록을 다시 slugify하지 않도록 하기 위한 UI 성능 guardrail이다.

Issue #25 preview surface는 wiki-link rendering과 heading folding을 같은 markdown preview 경로에서 적용한다. Fold key는 frontmatter를 제거한 raw markdown 기준으로 만들어 preview와 edit mode가 `munjib:heading-folds:<documentId>` localStorage state를 공유한다. Edit mode도 CodeMirror folded range를 heading range로 matching해 같은 key set을 저장하므로, gutter에서 접고 펼친 상태가 preview chevron state로 이어진다. Wiki-link conversion은 heading/body chunk가 `ReactMarkdown`에 전달되기 전에 적용되므로, 접힌 section을 다시 펼쳤을 때도 내부 wiki link는 기존 preview navigation 동작을 유지한다.

Heading folding 때문에 preview를 leading markdown, heading, body chunk로 나누어 렌더링하더라도 문서 전체 Markdown reference link와 footnote definition은 각 chunk에 공유한다. Definition line 뒤의 indented/blank continuation line도 같은 definition block으로 공유하므로, 앞 section의 `[ref][x]`나 `[^note]`는 뒤 section의 multi-line reference/footnote definition을 계속 resolve한다.

## Backlinks

Backlink는 별도 텍스트 검색이 아니라 `DocumentLink.targetDocumentId`를 통해 계산된다. 현재 문서를 target으로 갖는 frontmatter link의 source document 목록은 graph view와 관계 정보에 사용하지만, Properties Links row에는 현재 문서의 YAML `links:` outgoing만 표시한다.

`getDocumentLinkPanels()`는 outgoing target과 backlink source document에 대해 document-level explicit permission을 반영한다. 사용자가 읽을 수 없는 target/source 문서는 link panel에서 제외된다.

Issue #34 workspace graph view는 document/tag/wiki graph DTO를 사용한다. Issue #65 이후 graph view는 persisted `DocumentLink` rows뿐 아니라 readable active document의 full markdown에서도 `[[...]]` links를 scan한다. Properties Links row와 backlinks는 계속 frontmatter `links:` 기반이지만, graph view는 full markdown links를 같은 folder-aware, underscore-aware target matching 규칙으로 resolve하고, repeated source-target edge를 deduplicate한다. Resolved graph wiki link는 source document node에서 readable target document node로 향하는 `wiki` edge로 렌더링하고, broken 또는 ambiguous link는 readable target document를 임의 선택하지 않고 raw wiki value node로 연결한다.

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
- `lib/wiki-links/resolve.ts`
- `lib/wiki-links/targets.ts`
- `lib/wiki-links/service.ts`
- `lib/knowledge-graph/model.ts`
- `lib/wiki-links/autocomplete.ts`
- `lib/wiki-links/preview.ts`
- `lib/wiki-links/types.ts`
- `components/knowledge-graph-view.tsx`
- `lib/markdown/folding.ts`
- `lib/documents/service.ts`
- `components/document-editor.tsx`
- `tests/components/document-editor-preview.test.tsx`
- `tests/wiki-links/preview.test.ts`
- `tests/wiki-links/reconcile.test.ts`
- `tests/wiki-links/autocomplete.test.ts`
- `tests/knowledge-graph/model.test.ts`
- GitHub issue #34
- GitHub issue #59
- `docs/superpowers/specs/2026-05-25-knowledge-graph-filter-link-coverage-design.md`
- Issue #25 final review blocker fix
- `docs/superpowers/specs/2026-05-24-underscore-wiki-link-targets-design.md`
- `docs/superpowers/plans/2026-05-24-underscore-wiki-link-targets.md`
