# Markdown Heading Folding Design

## Summary

Munjib 문서 편집 화면에 Obsidian-style markdown heading folding을 추가한다. 사용자는 `#`, `##`, `###` 같은 heading 단위로 문서 섹션을 접고 펼칠 수 있다. Preview 화면은 heading row의 chevron button으로 rendered section을 접고, Edit 화면은 CodeMirror의 markdown folding 기능으로 raw markdown heading section을 접는다.

이 설계의 GitHub issue는 [#25 Markdown heading folding](https://github.com/dschoi30/munjib/issues/25)이다.

## Goals

- Preview mode에서 markdown heading hierarchy 기준으로 섹션을 접고 펼친다.
- Edit mode에서 CodeMirror markdown folding을 활성화한다.
- 접힘 상태는 Preview와 Edit mode 모두 문서별 브라우저 `localStorage`에 저장한다.
- 접힘은 markdown 본문을 삭제하거나 저장 payload를 바꾸지 않는다.
- 기존 wiki-link preview rendering과 frontmatter hiding 동작을 유지한다.
- 기존 split mode는 제거한다. 최종 editor mode는 `edit`과 `preview`만 남긴다.

## Non-goals

- 접힘 상태를 DB에 사용자별로 저장하지 않는다.
- 다른 브라우저나 기기 간 접힘 상태 동기화는 지원하지 않는다.
- raw CodeMirror editor line 안에 preview와 같은 custom chevron UI를 직접 그리지 않는다.
- heading/block link, embed rendering, 문서 outline navigation은 이번 범위에 포함하지 않는다.

## Current Context

`components/document-editor.tsx`는 현재 `edit`, `split`, `preview` 세 mode를 제공한다. `MarkdownPreview`는 frontmatter를 제거한 markdown을 `renderPreviewMarkdownWithWikiLinks()`로 변환한 뒤 `ReactMarkdown`으로 렌더링한다. Wiki-link preview는 readable document 후보를 `?document=<id>` 링크로 바꾸고, unresolved target은 plain text로 보여준다.

현재 CodeMirror 설정은 `foldGutter: false`로 되어 있어 editor folding affordance가 꺼져 있다. 이번 기능은 이 설정을 바꿔 markdown heading fold를 사용할 수 있게 한다.

## User Experience

Preview mode에서 heading 왼쪽에 chevron button을 둔다.

- 펼쳐진 heading은 기본 상태에서 chevron을 숨긴다.
- 펼쳐진 heading row에 hover하거나 chevron button에 focus하면 chevron을 보여준다.
- 접힌 heading은 접힘 상태를 인지할 수 있도록 chevron을 항상 보여준다.
- chevron은 펼쳐짐 상태에서 아래 방향, 접힘 상태에서 오른쪽 방향으로 표시한다.
- button은 `aria-expanded`와 구체적인 `aria-label`을 가진다.

사용자가 heading을 접으면 해당 heading의 content body만 숨긴다. Heading 자체는 항상 화면에 남는다. 접힌 상위 heading을 다시 펼치면 내부 하위 heading들의 기존 접힘 상태는 유지된다.

Split mode는 이번 작업에서 제거한다. 이 기능의 preview surface는 full preview mode 하나로 단순화하고, edit mode는 CodeMirror folding만 담당한다.

## Folding Semantics

접힘 범위는 markdown heading hierarchy를 따른다.

- `# A`를 접으면 다음 `#` 전까지 숨긴다.
- `## B`를 접으면 다음 `##` 또는 상위 heading 전까지 숨긴다.
- `### C`도 같은 방식으로 다음 같은 레벨 또는 상위 heading 전까지 숨긴다.
- 더 깊은 heading level도 같은 규칙을 적용할 수 있지만, 검증 우선순위는 `#`, `##`, `###`이다.

Frontmatter는 기존처럼 preview 본문에서 제외되며 heading fold 대상이 아니다. Fenced code block, indented code block, inline code 안의 `#`도 heading으로 취급하지 않는다.

## State Model

접힘 상태는 Preview와 Edit mode가 공유하는 문서별 `localStorage`에 저장한다.

```text
munjib:heading-folds:<documentId>
```

값은 접힌 heading key 목록을 JSON으로 저장한다. Preview는 이 key set으로 section visibility를 결정하고, Edit mode는 같은 key set을 CodeMirror fold range로 변환해 복원한다. Heading key는 문서 안에서 안정적이어야 하므로 다음 정보를 조합한다.

- heading level
- 정규화한 heading text
- 같은 parent 아래 같은 heading text가 반복될 때의 occurrence index
- parent heading key를 포함한 hierarchy path

문서 markdown이 바뀌어 저장된 key가 더 이상 존재하지 않으면 해당 key는 복원하지 않는다. 구현은 현재 문서의 heading key set을 기준으로 stale key를 자연스럽게 무시하고, 다음 write 때 정리한다.

## Preview Architecture

Preview rendering은 기존 wiki-link 변환을 유지한 상태에서 heading folding layer를 추가한다.

1. `stripDocumentFrontmatter(markdown)`로 frontmatter를 제거한다.
2. `renderPreviewMarkdownWithWikiLinks()`로 wiki-link text를 preview markdown link로 변환한다.
3. Folding helper가 markdown을 heading section 단위로 분석한다.
4. `MarkdownPreview`는 section tree를 렌더링하며 각 heading row에 chevron button을 붙인다.

Folding helper는 source markdown의 line structure를 기준으로 heading section을 만든다. Code block과 frontmatter 제외 처리는 testable pure function으로 분리한다. `ReactMarkdown`은 section body markdown chunk를 렌더링하는 데 계속 사용한다.

이 구조는 wiki-link 변환과 heading fold를 분리한다. Wiki-link target resolution은 기존 `lib/wiki-links/preview.ts` 책임으로 남고, heading sectioning은 markdown folding helper 책임으로 둔다.

## Editor Architecture

Edit mode는 CodeMirror markdown extension과 folding support를 활용한다. 현재 `basicSetup.foldGutter`를 꺼둔 설정을 조정해 fold gutter를 활성화한다. CodeMirror가 markdown heading range를 접을 수 있으면 별도 raw editor UI를 만들지 않는다.

Editor persistence는 preview와 같은 heading key set을 사용한다. 문서 로드 시 folding helper가 heading key와 editor line range를 계산하고, 저장된 folded key에 대응하는 range를 CodeMirror fold effect로 접는다. 사용자가 editor에서 fold gutter로 heading을 접거나 펼치면 가능한 경우 해당 heading key를 찾아 같은 localStorage entry를 갱신한다.

CodeMirror transaction에서 fold/unfold origin을 안정적으로 구분하기 어렵다면 editor 쪽 localStorage write는 heading row command를 통해 구현하고, gutter-only interaction 저장은 후속 보강으로 분리한다. 단, 문서 진입 시 localStorage에 저장된 heading을 editor에서 복원하는 것은 이번 MVP 범위에 포함한다.

## Component Changes

- `components/document-editor.tsx`
  - `EditorMode`에서 `split`을 제거한다.
  - mode toggle을 `Edit`, `Preview` 두 버튼으로 줄인다.
  - preview pane은 `mode === "preview"`일 때만 렌더링한다.
  - CodeMirror folding 설정을 활성화한다.
  - `MarkdownPreview`가 document id를 받아 localStorage key를 만들 수 있게 한다.
  - CodeMirror view가 document id와 heading key/range map을 받아 저장된 folded keys를 복원할 수 있게 한다.

- `lib/markdown/folding.ts`
  - markdown heading section parsing pure functions를 추가한다.
  - heading key 생성과 section tree/range 계산을 담당한다.
  - frontmatter, fenced code, indented code handling을 testable하게 만든다.

- `tests/markdown/folding.test.ts`
  - heading hierarchy, repeated headings, code block 제외, frontmatter 제외, stale key handling에 필요한 pure function behavior를 검증한다.

## Error Handling

`localStorage`를 사용할 수 없는 환경에서는 접힘 상태를 메모리 state로만 유지한다. JSON parse 실패, quota error, private browsing 제한 등은 preview rendering을 막지 않아야 한다. 실패 시 접힘 상태는 빈 set으로 시작하고, write 실패는 조용히 무시한다.

Markdown이 비어 있거나 heading이 없으면 기존처럼 preview body를 렌더링한다. 접힘 UI는 heading이 있는 경우에만 나타난다.

## Testing Plan

- `tests/markdown/folding.test.ts`
  - `#`, `##`, `###` heading hierarchy sectioning
  - repeated heading key uniqueness
  - frontmatter heading-like text ignored
  - fenced, indented, inline code heading-like text ignored
  - section body boundaries preserve markdown content

- Existing wiki-link preview tests
  - `tests/wiki-links/preview.test.ts`는 기존 behavior를 유지한다.
  - heading이 섞인 markdown에서도 `[[...]]` 변환 결과가 유지되는 case를 추가할 수 있다.

- Component-level or e2e coverage
  - preview heading chevron click으로 body visibility가 toggle되는지 검증한다.
  - localStorage에 저장된 folded key가 document 재진입 시 복원되는지 검증한다.
  - edit mode 진입 시 저장된 heading fold key가 CodeMirror range로 복원되는지 검증한다.
  - split mode toggle이 더 이상 나타나지 않는지 검증한다.

## Wiki Updates

구현 시 `wiki/Document Editing Workflow.md`에 다음 내용을 반영한다.

- editor mode가 edit/preview로 단순화됨
- preview heading folding behavior
- edit mode CodeMirror fold gutter
- preview와 edit mode 접힘 상태가 localStorage 기반 UI state라는 점

`wiki/Wiki Links And Backlinks.md`는 wiki-link preview rendering과 heading folding이 같은 preview surface에서 공존한다는 regression guardrail을 짧게 추가한다.

`wiki/log.md`에는 issue #25 source evidence와 변경된 wiki page를 기록한다.

## Open Decisions Closed

- Scope: Editor와 Preview 둘 다 지원한다.
- State: 문서별 browser localStorage를 사용한다.
- Folding unit: heading hierarchy 기준 section folding을 사용한다.
- Preview chevron: 펼쳐진 heading은 hover/focus 때만 표시하고, 접힌 heading은 항상 표시한다.
- Split mode: 이번 작업 범위에 포함해 제거한다.
