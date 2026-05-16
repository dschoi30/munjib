# Metadata Panel Outline Design

## Summary

Munjib 오른쪽 metadata panel에 `Outline` tab을 추가한다. Outline은 현재 선택한 문서의 markdown에서 ATX heading `#`, `##`, `###`, `####`를 추출해 계층형 tree로 보여주고, 사용자가 outline row를 클릭하면 문서 화면의 해당 heading으로 스크롤한다.

이 기능은 기존 metadata panel의 icon-only tab toolbar를 확장한다. `Outline` icon은 첫 번째 tab으로 배치하고, visual treatment는 `components/document-list.tsx`와 `components/document-navigation.tsx`의 sidebar tree row, hover, active, vertical guide line 패턴을 따른다.

## Goals

- Metadata panel toolbar 첫 번째에 `Outline` icon tab을 추가한다.
- 현재 선택 문서의 `contentMarkdown`에서 `#`부터 `####`까지 heading text를 추출한다.
- Heading hierarchy를 tree로 구성하고 level별 vertical guide line으로 깊이를 명확히 보여준다.
- Outline row 클릭 시 현재 document editor/preview surface의 해당 heading으로 스크롤한다.
- Existing `Attachments`, `Versions`, `Audit log`, panel close behavior를 유지한다.
- Markdown heading parser는 fenced code block 내부의 `#` line을 heading으로 취급하지 않는다.

## Non-goals

- `#####` 이상 heading은 이번 outline tree에 표시하지 않는다.
- Outline tree에서 heading collapse/expand는 제공하지 않는다.
- DB schema, document save payload, version model은 변경하지 않는다.
- Outline selection state를 localStorage나 서버에 저장하지 않는다.
- Cross-document outline, backlinks, graph relation은 이번 범위가 아니다.

## Current Context

`components/metadata-panel.tsx`는 client component이며 현재 `attachments`, `versions`, `audit` 세 tab을 가진다. Toolbar button은 `h-8 w-8`, inactive transparent surface, active `bg-slate-200 text-ink`, Radix tooltip을 사용한다. Panel close control은 `useRightPanel()`의 collapse action 또는 주입된 `onTogglePanel` callback을 호출한다.

`app/workspaces/[workspaceSlug]/page.tsx`는 selected document의 `contentMarkdown`를 `DocumentEditor`에 넘기지만, `MetadataPanel`에는 versions, audit logs, attachments만 넘긴다. Outline을 만들려면 selected document id/title/markdown 또는 최소 `contentMarkdown` prop을 metadata panel에 추가해야 한다.

`components/document-navigation.tsx`는 folder/document tree를 재귀로 렌더링하며 nested level을 `ml-3 border-l border-slate-200 pl-2`로 표현한다. 이번 outline tree의 level guide도 같은 visual grammar를 사용한다.

## User Experience

Metadata panel toolbar 순서는 다음과 같다.

1. Outline
2. Attachments
3. Versions
4. Audit log
5. Close metadata panel

Outline tab을 열면 panel body에 `Outline` section이 표시된다. Heading이 있으면 각 row는 heading text를 한 줄 truncation으로 보여준다. `#` heading은 root level에 놓이고, 하위 heading은 parent 아래에 nested guide line을 둔다. Row hover는 document list row처럼 slate highlight를 보여주고, keyboard focus도 visible surface를 가진다.

사용자가 outline row를 클릭하면 현재 보이는 문서 surface에서 같은 heading으로 부드럽게 이동한다. Preview mode에서는 rendered heading element로 이동한다. Edit mode에서는 CodeMirror document에서 해당 source line을 찾아 editor view를 그 line으로 scroll한다. Outline click은 cursor 위치를 바꾸지 않아도 되지만, 사용자가 보는 viewport는 선택한 heading 근처로 이동해야 한다.

Heading이 없거나 선택 문서가 없으면 `No outline headings` empty state를 보여준다.

## Heading Semantics

Outline parser는 markdown source line을 순회해 ATX heading을 찾는다.

- `# Heading`, `## Heading`, `### Heading`, `#### Heading`만 포함한다.
- `#####` 이상은 무시한다.
- Closing hash marker는 text에서 제거한다. 예: `## Title ##`은 `Title`로 표시한다.
- Leading/trailing whitespace는 제거한다.
- Empty heading text는 표시하지 않는다.
- Fenced code block 안의 heading-like line은 무시한다.
- YAML frontmatter 내부 heading-like text는 문서 본문 heading으로 취급하지 않는다.

동일한 heading text가 여러 번 등장할 수 있으므로 outline item id는 level, normalized text, source line index를 조합해 만든다. Scroll target id/data attribute도 같은 값에서 파생한다.

## Component Architecture

### Metadata panel

`MetadataPanel`은 selected document 정보를 선택적으로 받는다.

```ts
type MetadataPanelDocument = {
  id: string;
  contentMarkdown: string;
} | null;
```

Panel 내부 tab union에 `outline`을 추가하고 기본 active tab을 `outline`로 둔다. 기존 test가 attachments default를 전제하므로, 구현 시 test를 새 기본값에 맞게 갱신한다.

`OutlineList` component는 parser 결과를 받아 nested tree를 렌더링한다. Row는 `button`으로 만들고 `aria-label`은 heading text와 level을 포함한다.

### Markdown outline helper

새 helper는 pure function으로 둔다.

```ts
buildMarkdownOutline(markdown: string): MarkdownOutlineItem[]
```

반환 item은 id, level, text, lineNumber, children을 가진다. Parser는 UI와 분리해 unit test로 hierarchy, code block, frontmatter 제외를 검증한다.

### Scroll target

`DocumentEditor`의 preview heading rendering 또는 shared heading rendering layer는 outline item id와 같은 deterministic id/data attribute를 heading element에 붙인다. Preview mode outline click handler는 `document.querySelector()`로 target을 찾고 `scrollIntoView({ block: "start", behavior: "smooth" })`를 호출한다. Edit mode는 outline item의 source line number를 `DocumentEditor` callback으로 넘겨 CodeMirror view를 해당 line으로 scroll한다.

기존 heading folding helper가 이미 heading hierarchy를 다루므로, 구현 전에 재사용 가능성을 확인한다. 다만 folding helper가 fold range와 localStorage key에 강하게 묶여 있으면 outline helper는 별도 pure helper로 두고 중복을 최소화한다.

## Error Handling

Markdown parse 실패는 throw하지 않고 empty outline으로 처리한다. Browser DOM target을 찾지 못하면 click은 no-op으로 끝난다. 이 경우 panel rendering이나 document editing은 막지 않는다.

Long heading text는 row 안에서 truncate한다. 매우 깊거나 불완전한 hierarchy도 level guide line만 유지하고 invalid nesting error를 보여주지 않는다.

## Testing Plan

- `tests/markdown/outline.test.ts`
  - `#`부터 `####`까지 hierarchy tree를 만든다.
  - `#####` 이상 heading을 무시한다.
  - closing hash marker와 whitespace를 정리한다.
  - fenced code block 내부 heading-like line을 무시한다.
  - frontmatter 내부 heading-like line을 무시한다.
  - repeated heading text도 stable unique id를 가진다.

- `tests/components/metadata-panel.test.tsx`
  - Outline tab이 첫 번째이고 기본 active tab이다.
  - Outline row가 heading hierarchy와 guide-line nesting으로 렌더링된다.
  - Attachments, Versions, Audit log tab 전환은 기존처럼 동작한다.
  - Heading row click이 matching DOM target의 `scrollIntoView()`를 호출한다.
  - Heading이 없으면 empty state를 보여준다.

- Type check
  - `pnpm exec tsc --noEmit`

## Wiki Updates

구현 시 `wiki/Document Editing Workflow.md`에 metadata panel의 Outline tab, heading extraction scope, click-to-scroll behavior를 기록한다.

`wiki/index.md`의 상태판에서 metadata panel 현재 구현 범위를 Issue #42 tab 구조에서 Outline 포함 구조로 갱신한다.

`wiki/log.md`에는 GitHub issue, spec, source files, tests를 evidence로 남긴다.

## Open Decisions Closed

- Outline tab은 metadata panel의 첫 번째 icon으로 둔다.
- 기본 active tab은 Outline이다.
- 표시 heading scope는 `#`, `##`, `###`, `####`이다.
- UI는 document list/navigation tree와 같은 vertical guide line을 사용한다.
- Row click은 heading scroll navigation을 제공한다.
