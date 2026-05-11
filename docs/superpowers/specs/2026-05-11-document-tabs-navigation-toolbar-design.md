# Document Tabs And Navigation Toolbar Design

## 목적

Munjib workspace의 문서 편집 화면 상단에 Obsidian 참고 이미지(`wiki/designs/obsidian1.png`)와 유사한 문서 탭 영역을 추가한다. 사용자는 여러 문서를 열린 탭으로 유지하고, 탭을 클릭해 현재 문서를 전환하며, 탭 하단의 toolbar에서 뒤로/앞으로 이동과 현재 문서 경로를 확인할 수 있어야 한다.

이 기능은 문서 데이터 모델이나 저장 형식을 바꾸지 않는다. 기존 `?document=<id>` 기반 선택 라우팅과 `Document.path` 기반 경로 모델을 유지하면서, 브라우저 UI 상태로 열린 탭 목록을 관리한다.

## 사용자 경험

상단 첫 줄은 문서 탭 strip이다. 문서를 열면 탭 목록에 추가되고, 이미 열려 있는 문서를 다시 선택하면 중복 탭을 만들지 않고 해당 탭을 active로 전환한다. Active 탭은 현재 문서와 일치하며, inactive 탭은 클릭 시 기존 workspace URL의 `document` query를 바꿔 문서를 연다.

각 탭은 문서 title을 표시하고, 닫기 버튼을 제공한다. 탭이 많아지면 한 줄 안에서 horizontal overflow로 스크롤된다. 탭 닫기 동작은 다음 규칙을 따른다.

1. 닫는 탭이 active 탭이 아니면 탭 목록에서만 제거한다.
2. 닫는 탭이 active 탭이고 오른쪽 탭이 있으면 오른쪽 탭을 연다.
3. 오른쪽 탭이 없고 왼쪽 탭이 있으면 왼쪽 탭을 연다.
4. 남은 탭이 없으면 workspace root로 이동한다.

상단 둘째 줄은 navigation toolbar다. 왼쪽에는 navigate back/forward icon button을 표시하고, 중앙 또는 왼쪽 정렬 영역에는 현재 선택 context의 path를 표시한다. 문서가 선택된 경우 `Document.path`를 사람이 읽기 쉬운 breadcrumb 형식으로 보여준다. Folder detail view에서는 folder path를 보여주고, 선택된 문서나 folder가 없으면 workspace root 상태를 표시한다.

## 범위

이번 범위에 포함한다.

- Workspace center 상단에 탭 strip과 navigation toolbar 추가.
- Workspace별 열린 탭 목록을 `localStorage`에 저장.
- 현재 URL의 `?document=<id>`를 active document source of truth로 유지.
- Sidebar, quick switcher, preview wikilink 등 기존 document navigation으로 문서가 선택되면 탭 목록에 자동 추가.
- 탭 클릭, 탭 닫기, stale tab 제거 동작 구현.
- Toolbar에 back/forward 버튼과 현재 path 표시.
- Component/unit 테스트와 e2e 테스트 추가.
- 관련 wiki 문서 업데이트.

이번 범위에서 제외한다.

- 여러 editor instance를 동시에 mount해서 문서별 unsaved editor state를 보존하는 동작.
- 탭 닫기 전 unsaved changes 경고.
- 자체 문서 방문 stack 기반의 정교한 back/forward disabled 상태.
- 탭 drag reorder, pinned tab, split pane, tab group.
- DB schema, Prisma model, markdown 저장 payload 변경.

## 접근 방식

권장 접근은 클라이언트 탭 상태와 서버 선택 라우팅을 분리하는 것이다.

`app/workspaces/[workspaceSlug]/page.tsx`는 지금처럼 selected document 또는 selected folder를 서버에서 결정한다. 새 center chrome 컴포넌트는 selected document, selected folder, readable documents를 props로 받아 클라이언트에서 열린 탭 목록을 관리한다. 탭 전환은 `router.push("/workspaces/<slug>?document=<id>")`로 수행한다.

이 방식은 현재 `DocumentEditor`의 단일 문서 controlled state와 잘 맞는다. `DocumentEditor`는 document id가 바뀌면 title/content state를 reset하는 기존 계약을 유지한다. 탭은 "열려 있는 문서 목록"을 표현할 뿐, 각 문서의 edit buffer를 별도로 보존하지 않는다.

## 컴포넌트 구조

새 컴포넌트는 작게 나눈다.

- `components/workspace-center-shell.tsx`
  - center 영역의 상단 chrome과 본문 content를 배치한다.
  - 탭/toolbar에 필요한 selected context와 document 후보를 전달한다.
- `components/document-tabs.tsx`
  - 열린 탭 렌더링, active 전환, 닫기 버튼, horizontal overflow를 담당한다.
- `components/document-toolbar.tsx`
  - back/forward icon button과 현재 path 표시를 담당한다.
- `components/use-document-tabs.ts`
  - `localStorage` read/write, 탭 dedupe, stale tab pruning, active 탭 삽입, close-target 계산을 담당한다.

`AppShell`은 center slot을 그대로 받되, center section padding과 overflow가 상단 chrome에 맞게 조정될 수 있다. 상단 chrome은 center column 내부에 위치하며 left navigation이나 right metadata panel에는 영향을 주지 않는다.

## 데이터 흐름

서버에서 전달하는 최소 데이터는 다음과 같다.

```ts
type TabDocument = {
  id: string;
  title: string;
  path: string;
};

type SelectedFolderContext = {
  id: string;
  name: string;
  path: string;
};
```

`page.tsx`는 readable active documents를 `TabDocument[]`로 전달한다. 클라이언트 훅은 `localStorage`에 남아 있는 id가 더 이상 readable document 목록에 없으면 제거한다. selected document가 있으면 최신 title/path로 탭 목록에 upsert한다. 문서 rename이나 move 후 서버 payload가 갱신되면 같은 id의 탭 title/path도 최신 값으로 바뀐다.

## Navigation Toolbar

Back/forward 버튼은 1차 구현에서 브라우저 history를 사용한다.

- Back: `window.history.back()`
- Forward: `window.history.forward()`

브라우저 history API는 앱이 신뢰할 수 있는 forward/back 가능 여부를 직접 제공하지 않는다. 따라서 MVP에서는 버튼을 항상 렌더링하고, disabled 상태는 도입하지 않는다. 정확한 disabled 상태와 Obsidian식 document-local history stack은 후속 기능으로 분리한다.

Path 표시는 다음 규칙을 사용한다.

- Document selected: selected document의 `path`
- Folder selected: selected folder의 `path`
- Empty/root: `/`

표현은 slash path를 breadcrumb-like inline text로 변환한다. 예를 들어 `/operations/operations-runbook`은 `operations / operations-runbook`으로 보여준다. 실제 route target이나 DB path는 변경하지 않는다.

## 오류와 예외 처리

`localStorage` 값이 깨져 있거나 예상 schema와 다르면 빈 탭 목록으로 복구한다. 탭 목록에 현재 readable document 목록에 없는 id가 있으면 제거한다. 탭 클릭 대상 문서가 pruning 이후 사라졌으면 workspace root로 이동한다.

서버에서 selected document가 없고 folder도 없는 상태는 기존 empty editor/root 상태를 유지한다. 이때 toolbar path는 `/`로 표시하고, 탭 strip은 기존 저장 탭이 있으면 유지한다.

## 테스트 계획

Unit/component 테스트는 탭 상태 계산을 우선 검증한다.

- selected document upsert는 중복 탭을 만들지 않는다.
- selected document의 title/path가 바뀌면 기존 탭 metadata를 갱신한다.
- readable 목록에 없는 stale tab은 제거된다.
- active tab close는 오른쪽, 왼쪽, root 순서로 다음 target을 계산한다.
- 깨진 `localStorage` 값은 빈 목록으로 복구된다.

E2E 테스트는 실제 workspace 화면에서 검증한다.

- sidebar에서 두 개 이상의 문서를 열면 상단 탭이 생성된다.
- inactive 탭 클릭 시 editor와 URL의 `document` query가 바뀐다.
- active 탭 닫기 시 다음 탭으로 전환된다.
- toolbar에 현재 문서 path가 표시된다.
- back/forward 버튼 클릭이 browser history navigation을 호출해 이전/다음 문서 선택으로 이동한다.

## Wiki 업데이트

구현 시 다음 wiki를 갱신한다.

- `wiki/Document Editing Workflow.md`: 문서 탭, toolbar, active document routing 흐름 추가.
- `wiki/Folder Hierarchy Model.md`: toolbar path 표시가 `Document.path`와 folder path를 사용한다는 점 추가.
- `wiki/index.md`: 현재 편집 경험 상태판에 탭 기능 링크 또는 요약 추가.
- `wiki/log.md`: Issue #29 설계/구현 근거와 affected pages 기록.
- `wiki/manifest.json`: `pnpm wiki:manifest`로 재생성.

## 승인 기준

- 사용자는 workspace center 상단에서 여러 문서 탭을 볼 수 있다.
- 문서 선택 경로가 sidebar, quick switcher, preview link 중 어디에서 시작돼도 열린 탭 목록이 최신화된다.
- 탭 클릭과 닫기 동작이 기존 `?document=<id>` 라우팅과 일관되게 동작한다.
- Toolbar back/forward와 path 표시가 `obsidian1.png`의 상단 구조를 반영한다.
- 기존 folder accordion behavior와 document editor behavior가 회귀하지 않는다.
