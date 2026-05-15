# Workspace Knowledge Graph View Design

## 목적

Munjib workspace에 Obsidian-style graph view를 추가한다. 사용자는 좌측 sidebar toolbar의 `Graph` icon button을 눌러 문서 본문 영역을 지식 그래프로 전환하고, workspace 안의 문서, tag, wiki link, frontmatter property 관계를 시각적으로 탐색할 수 있어야 한다.

이 기능은 문서 저장 모델을 바꾸지 않는다. 기존 `Document`, `DocumentLink`, `DocumentTag`, `DocumentProperty` 데이터를 읽어 graph view model을 만들고, 문서 편집과 folder/detail route는 기존 `?document=<id>` / `?folder=<id>` 계약을 유지한다.

## 사용자 경험

좌측 toolbar에는 기존 `Documents`, `New document`, `New folder`, `Search`, `Favorites` 옆에 `Graph` icon button을 추가한다. `Graph`를 클릭하면 URL은 workspace-level graph state인 `?graph=1`로 전환되고, center content 영역은 editor 대신 graph view를 표시한다. Graph view가 활성화되면 toolbar의 `Graph` button은 active state를 갖는다.

Graph view 상단 chrome은 기존 `DocumentTabs`와 `DocumentToolbar` 구조를 유지한다. Center toolbar path는 graph 상태에서 `Graph view`로 표시한다. 문서가 선택된 상태에서 graph를 열면 전체 workspace graph를 보여주되 선택 문서와 직접 연결된 1-hop node/edge를 강조한다. 선택 문서가 없는 상태에서 graph를 열면 focus highlight 없이 전체 workspace graph만 표시한다.

Graph canvas는 mouse wheel zoom과 background drag pan을 지원한다. Document node를 클릭하면 해당 문서 URL인 `?document=<id>`로 이동하며 graph view를 닫는다. Property node를 클릭하는 동작은 이번 범위에서는 filter-by-value 후보로만 설계하고, 구현 범위에서는 hover/label 표시까지로 제한한다.

우측에는 Obsidian 참고 이미지처럼 floating filter panel을 둔다. 사용자는 panel을 열고 닫을 수 있으며, filter type별 toggle을 복수 적용할 수 있다. Filter panel이 닫혀도 graph zoom/pan state와 enabled filter state는 유지된다.

## 범위

이번 범위에 포함한다.

- Sidebar create controls에 `Graph` icon button과 tooltip 추가.
- Workspace URL에 `graph=1` query를 추가해 graph view를 editor/folder detail과 구분.
- Center content 영역에 `KnowledgeGraphView` 추가.
- Workspace readable documents 기반 graph data 생성.
- Document, tag, wiki target, property value node 표현.
- Wiki link, tag, property edge type별 색상 구분.
- 현재 문서가 있을 때 1-hop focus highlight 적용.
- Zoom, pan, node click interaction 지원.
- 열고 닫을 수 있는 filter panel과 type별 toggle 추가.
- Component/unit tests, route tests, focused e2e smoke 추가.
- 관련 wiki 문서 업데이트.

이번 범위에서 제외한다.

- Graph layout 좌표를 DB나 localStorage에 저장.
- Node drag position persistence.
- Graph 안에서 문서 편집, property 편집, tag 편집.
- Graph search, group creation, physics tuning UI.
- Property node click으로 즉시 filter-by-value를 적용하는 고급 interaction.
- 대규모 graph virtualization 또는 server-side graph paging.
- Graph view를 별도 document tab instance로 저장하는 동작.

## 접근 방식

권장 접근은 route-level graph mode와 canvas 기반 graph renderer를 결합하는 것이다.

`app/workspaces/[workspaceSlug]/page.tsx`는 `searchParams.graph === "1"`이면 selected document/folder editor 대신 graph view를 center children으로 전달한다. Selected document가 있어도 graph mode가 우선하며, selected document id는 focus target으로만 사용한다. Graph mode가 꺼지면 기존 selected folder/document 렌더링으로 돌아간다.

Graph renderer는 직접 SVG를 매번 그리는 방식이 아니라 `react-force-graph-2d`를 사용한다. 이 라이브러리는 2D canvas force graph, zoom/pan, node dragging, hover/click interaction을 제공하므로 Obsidian-style graph에 맞다. `@xyflow/react`는 workflow editor와 manual node diagram에 강점이 있지만, force-directed workspace graph에는 layout과 physics를 별도로 설계해야 하므로 이번 기능에는 적합도가 낮다.

선택 문서가 바뀔 때마다 graph data를 새로 만들지 않는다. 서버는 readable workspace graph data를 구성해 client component에 전달하고, client는 `useMemo`로 node/link model을 안정화한다. 선택 문서 변경은 focus node id, 1-hop focused node/link id set, opacity, stroke width, glow style만 갱신한다. Zoom/pan state는 `KnowledgeGraphView` 내부에 유지해 focus 변경으로 viewport가 튀지 않게 한다.

## 컴포넌트 구조

새 컴포넌트와 helper는 다음 경계로 나눈다.

- `components/document-create-controls.tsx`
  - `Graph` icon button 추가.
  - `activeView: "documents" | "search" | "favorites" | "graph"` prop을 받아 graph active state를 표시한다.
- `components/document-list.tsx`
  - `onOpenGraph` handler를 추가하고 sidebar toolbar로 전달한다.
  - Search/favorites/documents panel state와 graph route state를 분리한다.
- `components/workspace-center-shell.tsx`
  - Graph mode에서 toolbar path를 `Graph view`로 표시한다.
  - Graph mode에서는 edit/preview mode toggle을 숨긴다.
- `components/knowledge-graph-view.tsx`
  - `react-force-graph-2d` wrapper.
  - graph data, selected document id, enabled filters, filter panel open state를 관리한다.
- `lib/knowledge-graph/model.ts`
  - Prisma result를 graph node/link DTO로 변환한다.
  - Focus set 계산과 filter 적용을 pure function으로 제공한다.

## Graph Data Model

Graph view는 document-only graph가 아니라 document + property node graph다.

```ts
type KnowledgeGraphNode =
  | { id: string; kind: "document"; documentId: string; label: string; path: string }
  | { id: string; kind: "tag"; label: string; normalizedName: string }
  | { id: string; kind: "wiki"; label: string; targetDocumentId: string | null }
  | { id: string; kind: "property"; label: string; key: string; value: string };

type KnowledgeGraphLink = {
  id: string;
  source: string;
  target: string;
  kind: "wiki" | "backlink" | "tag" | "property";
};
```

Node id는 kind prefix를 붙여 충돌을 막는다.

- `document:<documentId>`
- `tag:<normalizedName>`
- `wiki:<targetDocumentId>` 또는 `wiki:broken:<normalizedTarget>`
- `property:<key>:<normalizedValue>`

Document nodes는 readable active documents만 포함한다. Tag nodes는 readable document에 연결된 tags만 포함한다. Wiki nodes는 `DocumentLink` 기반으로 만들되, readable target document가 있으면 target document node에 직접 link를 만들고, broken/ambiguous link는 별도 wiki node로 표현한다. Property nodes는 frontmatter property 중 `tags`와 `links` canonical rows를 제외한 key/value를 대상으로 한다.

## 관계와 색상

Filter type별 색상은 graph node, edge, legend가 같은 값을 사용한다.

- `wiki`: purple. Source document와 resolved target document 또는 broken/ambiguous wiki node를 연결한다.
- `backlink`: green. Current document focus에서 incoming relation을 강조할 때 사용한다. Data source는 wiki link와 같지만 focus styling에서 방향을 구분한다.
- `tag`: amber. Document와 tag node를 연결한다.
- `property`: sky blue. Document와 property value node를 연결한다.

여러 filter가 동시에 켜져도 type별 색상은 유지한다. Filter를 끄면 해당 type의 links를 숨기고, 남은 visible link가 없는 non-document property node는 숨긴다. Document node는 filter 결과에 연결 edge가 없어도 전체 graph context를 위해 기본적으로 남긴다.

## Data Flow

`page.tsx`는 workspace와 readable documents를 조회한 뒤 graph mode에서 필요한 관계 데이터를 함께 조회한다.

- `DocumentLink`: source document가 readable인 rows. Target document가 unreadable이면 resolved edge 대신 filtered-out link로 취급한다.
- `DocumentTag`: readable documents의 tags.
- `DocumentProperty`: readable documents의 frontmatter properties.

Permission model은 기존 `filterReadableDocuments()` 결과를 graph source of truth로 사용한다. 사용자가 읽을 수 없는 source document는 graph에 나타나지 않는다. 읽을 수 없는 target document로 향하는 link도 document node로 표시하지 않는다.

Client graph component는 server DTO를 props로 받아 filter state와 focus state만 client에서 계산한다. Node click은 document node일 때만 `router.push("/workspaces/<slug>?document=<id>")`를 호출한다.

## 오류와 예외 처리

Readable documents가 없으면 graph canvas 대신 empty state를 표시한다. Graph data는 있지만 filter 때문에 visible edge가 없으면 document nodes만 남기고 filter panel에 현재 filter 상태를 보여준다.

`react-force-graph-2d`는 browser-only component이므로 Next.js server rendering과 충돌하지 않게 dynamic import 또는 client-only wrapper로 로드한다. 라이브러리 로드 실패는 일반적인 React error boundary 범위에 맡기고, 별도 retry UI는 이번 범위에 넣지 않는다.

Broken/ambiguous wiki link는 target document가 없으므로 document click navigation을 제공하지 않는다. 대신 wiki node label만 보여준다.

## 테스트 계획

Pure model tests를 먼저 작성한다.

- readable documents에서 document nodes를 만든다.
- tag rows에서 tag nodes와 tag links를 만든다.
- resolved wiki links는 document-to-document links를 만든다.
- broken wiki links는 wiki value node를 만든다.
- canonical `tags` / `links` property rows는 property nodes에서 제외한다.
- property rows는 key/value별 property nodes와 links를 만든다.
- selected document focus는 1-hop node/link id set을 계산한다.
- filter off 상태는 해당 type links와 고립 property nodes를 숨긴다.

Component tests는 graph shell behavior를 검증한다.

- Sidebar graph button은 `Graph` tooltip과 active state를 갖는다.
- Graph button click은 `?graph=1` route를 요청한다.
- Graph mode toolbar path는 `Graph view`를 표시한다.
- Filter panel toggle은 panel을 열고 닫는다.
- Document node click handler는 해당 document route를 요청한다.

E2E smoke는 seeded Company Handbook workspace에서 수행한다.

- 로그인 후 graph button을 클릭하면 graph view가 열린다.
- Filter panel을 닫고 다시 열 수 있다.
- 문서 node를 클릭하면 editor route로 돌아간다.

## Wiki 업데이트

구현 시 다음 wiki를 갱신한다.

- `wiki/Document Editing Workflow.md`: sidebar graph mode, route contract, center view 전환 흐름 추가.
- `wiki/Document Knowledge Model.md`: graph view가 `DocumentLink`, `DocumentTag`, `DocumentProperty`를 읽어 관계를 표현한다는 점 추가.
- `wiki/Wiki Links And Backlinks.md`: graph view에서 resolved/broken/ambiguous wiki links가 어떻게 표현되는지 추가.
- `wiki/index.md`: 현재 workspace UI 상태판에 graph view 추가.
- `wiki/log.md`: Issue #34 설계/구현 근거와 affected pages 기록.
- `wiki/manifest.json`: `pnpm wiki:manifest`로 재생성.

## 승인 기준

- Sidebar toolbar에서 graph icon button을 볼 수 있고 tooltip이 표시된다.
- Graph button을 누르면 center content가 graph view로 전환된다.
- 선택 문서가 있으면 전체 graph 안에서 해당 문서와 직접 관계가 강조된다.
- 선택 문서가 없어도 전체 workspace graph가 열린다.
- Zoom/pan이 동작하고, focus 변경이 graph viewport를 불필요하게 초기화하지 않는다.
- Filter panel을 열고 닫을 수 있으며, filter type별 색상 legend와 edge/node 색상이 일치한다.
- Document, tag, wiki/property link, frontmatter property 관계가 서로 구분된다.
- Document node click은 해당 문서 editor로 이동한다.
- 기존 document list, search, favorites, document tabs, edit/preview behavior가 회귀하지 않는다.

## Implementation Decisions

- Node label density는 첫 구현에서 force-graph 기본 label hover와 selected/focused node label 위주로 제한한다. 항상 모든 label을 보여주는 고밀도 모드는 후속으로 둔다.
- Property nodes는 scalar frontmatter values만 대상으로 한다. Nested object/array는 첫 구현에서 JSON 문자열화하지 않고 제외한다.
- Graph physics tuning UI는 후속으로 둔다. 첫 구현은 library default와 고정된 conservative force settings만 사용한다.
