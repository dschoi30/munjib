    # 사내 문서 위키 웹서비스: Obsidian Clone 기획 및 개발 계획

    ## 1. 분석 대상

    - 파일: `/Users/developer/dev/obsidian-clone/obsidian-analysis-report.md`
    - 주제: Obsidian의 설계 철학, 기능 구조, UI/UX, 동기화/보안, 검색, 그래프, 캔버스, 프로퍼티, 한계 분석

    ## 2. 보고서 핵심 분석

    ### 2.1 핵심 철학

    Obsidian의 가장 중요한 철학은 다음과 같다.

    - File over App
    - Local-first
    - Markdown 기반 데이터 영속성
    - 사용자가 데이터를 소유하는 구조
    - 앱이 사고방식을 강제하지 않고, 사용자가 자기 방식으로 지식 구조를 만든다는 철학

    사내 위키로 전환할 때는 이 철학을 그대로 복제하기보다, “사용자가 문서와 지식 구조를 장기적으로 소유하고 이동할 수 있다”는 방향으로 재해석하는 것이 좋다.

    ### 2.2 핵심 기능

    보고서에서 확인한 Obsidian의 핵심 기능은 다음과 같다.

    - Markdown + Obsidian Flavored Markdown
    - `[[Wiki Link]]`
    - Backlink
    - Outgoing Link
    - Graph View
    - Canvas
    - Properties / YAML Frontmatter
    - Search Operators
    - Bookmarks
    - Version History
    - Publish
    - Sync / E2EE
    - Plugin ecosystem
    - Workspace, Sidebar, Ribbon, Command Palette, Quick Switcher

    ### 2.3 강점

    - 문서 간 연결성이 강하다.
    - 장기 보존 가능한 Markdown 파일 구조를 사용한다.
    - 개인 지식관리, 연구, 개발자 워크플로우에 적합하다.
    - 그래프/백링크를 통한 탐색 경험이 차별화된다.
    - 고급 사용자를 위한 커스터마이징 가능성이 크다.

    ### 2.4 한계

    - 학습 곡선이 높다.
    - 빈 Vault에서 시작하는 부담이 있다.
    - 실시간 협업 기능이 약하다.
    - 모바일 UX가 불안정하다.
    - 개인용 도구 중심이라 사내 조직 지식관리에는 권한, 감사, 협업 기능이 부족하다.

    ### 2.5 사내 위키 전환 결론

    Obsidian을 그대로 복제하면 안 된다.

    목표는 “Obsidian식 링크 기반 지식관리 UX”를 “기업용 협업 위키 + 권한 + 검색 + 감사 + 템플릿”으로 재설계하는 것이다.

    ## 3. 제품 방향성

    ### 3.1 제품 정의

    사내 문서를 Markdown 기반으로 작성하고, 문서 간 연결/검색/권한/버전관리를 제공하는 웹 기반 Obsidian형 기업 위키.

    ### 3.2 한 문장 피치

    Notion보다 가볍고, Confluence보다 연결성이 좋고, Obsidian보다 협업과 권한에 강한 사내 지식 위키.

    ### 3.3 핵심 차별화

    - Markdown-first
    - `[[문서 링크]]` 중심의 연결형 문서 구조
    - Backlink / Graph 기반 지식 탐색
    - 사내 SSO / 팀 권한 / 감사 로그
    - 문서 템플릿과 리뷰 플로우
    - 장기적으로 Git-like versioning 또는 Markdown export 지원

    ## 4. MVP 범위

    ### 4.1 MVP 필수 기능

    #### 인증 / 조직 구조

    - 로그인
    - 조직 / 워크스페이스
    - 사용자 / 팀
    - 역할
      - Owner
      - Admin
      - Editor
      - Viewer

    #### 문서 관리

    - 문서 생성
    - 문서 수정
    - 문서 삭제 / 아카이브
    - 폴더 또는 컬렉션 구조
    - 최근 문서
    - 즐겨찾기

    #### Markdown Editor

    - Markdown 작성
    - Live Preview 또는 Split Preview
    - 코드블록
    - 표
    - 체크리스트
    - 이미지 업로드
    - 첨부파일 링크

    #### Wiki Link

    - `[[문서명]]` 파싱
    - 문서 자동완성
    - 존재하지 않는 문서 클릭 시 새 문서 생성
    - 문서명 변경 시 링크 유지 또는 자동 업데이트

    #### Backlink

    - 현재 문서를 참조하는 문서 목록
    - Outgoing links
    - Broken links

    #### Search

    - 제목 검색
    - 본문 검색
    - 태그 검색
    - 작성자/수정일 필터
    - 권한 기반 검색 결과 필터링

    #### Tags / Properties

    - `#tag`
    - YAML frontmatter
    - 문서 속성
      - owner
      - status
      - type
      - reviewed_at
      - review_due_at

    #### Version History

    - 수정 이력 저장
    - 이전 버전 보기
    - 복구
    - 변경자 기록

    #### 권한

    - Workspace 권한
    - Folder 권한
    - Document 권한
    - 읽기/쓰기/관리 권한
    - 검색/백링크/그래프에도 권한 필터 적용

    #### 기본 Graph View

    - MVP에서는 “현재 문서 기준 Local Graph” 우선
    - 노드
      - 문서
      - 태그
    - 엣지
      - wiki link
      - backlink

    ### 4.2 MVP에서 제외할 기능

    - 완전한 실시간 동시 편집
    - Obsidian 플러그인 호환
    - Canvas
    - 모바일 앱
    - E2EE
    - Publish public site
    - 고급 Dataview 쿼리
    - 복잡한 그래프 물리엔진 커스터마이징

    ## 5. 추천 기술 스택

    ### 5.1 Frontend

    - Next.js
    - TypeScript
    - Tailwind CSS
    - shadcn/ui
    - CodeMirror 6
    - React Markdown / unified / remark / rehype
    - React Flow 또는 Cytoscape.js

    ### 5.2 Backend

    빠른 MVP:

    - Next.js App Router
    - Server Actions / Route Handlers
    - Prisma
    - PostgreSQL

    장기 확장성:

    - Next.js frontend
    - NestJS backend
    - Prisma or Drizzle
    - PostgreSQL
    - Redis
    - Meilisearch / OpenSearch

    추천은 초기에는 Next.js monorepo로 시작하고, API 복잡도가 커지면 NestJS로 분리하는 것이다.

    ### 5.3 Database

    - PostgreSQL

    ### 5.4 Search

    MVP:

    - PostgreSQL Full Text Search

    확장:

    - Meilisearch
    - OpenSearch
    - Elasticsearch

    ### 5.5 Storage

    - Markdown 본문: PostgreSQL 저장 추천
    - 첨부파일: S3 호환 Object Storage
    - Export 기능으로 Markdown 파일 다운로드 제공

    ### 5.6 Auth

    - Auth.js / NextAuth
    - Google Workspace OAuth
    - 추후 OIDC/SAML
      - Okta
      - Azure AD
      - Keycloak

    ### 5.7 Deployment

    - Docker Compose for internal deployment
    - 또는 Vercel + Managed Postgres + S3
    - 사내망 배포 필요 시
      - Kubernetes
      - PostgreSQL
      - Redis
      - MinIO

    ## 6. 핵심 데이터 모델 초안

    ```text
    users
    - id
    - email
    - name
    - avatar_url
    - created_at
    - updated_at

    organizations
    - id
    - name
    - slug
    - created_at

    teams
    - id
    - organization_id
    - name

    team_members
    - id
    - team_id
    - user_id
    - role

    workspaces
    - id
    - organization_id
    - name
    - slug
    - visibility

    documents
    - id
    - workspace_id
    - parent_id
    - title
    - slug
    - path
    - content_markdown
    - content_text
    - created_by
    - updated_by
    - status
    - created_at
    - updated_at
    - archived_at

    document_versions
    - id
    - document_id
    - version_number
    - content_markdown
    - created_by
    - created_at
    - change_summary

    document_links
    - id
    - workspace_id
    - source_document_id
    - target_document_id
    - target_title_raw
    - link_type
    - is_broken
    - created_at

    tags
    - id
    - workspace_id
    - name
    - normalized_name

    document_tags
    - id
    - document_id
    - tag_id

    document_properties
    - id
    - document_id
    - key
    - value_json
    - value_type

    permissions
    - id
    - resource_type
    - resource_id
    - subject_type
    - subject_id
    - permission
    - inherited_from_id

    comments
    - id
    - document_id
    - user_id
    - body
    - created_at
    - resolved_at

    audit_logs
    - id
    - organization_id
    - actor_id
    - action
    - resource_type
    - resource_id
    - metadata_json
    - created_at

    attachments
    - id
    - document_id
    - file_name
    - mime_type
    - size
    - storage_key
    - uploaded_by
    - created_at
    ```

    ## 7. 아키텍처 설계

    ### 7.1 문서 저장 흐름

    1. 사용자가 Markdown 저장
    2. 서버에서 Markdown 파싱
    3. 다음 정보를 추출
       - plain text
       - headings
       - wiki links
       - tags
       - frontmatter properties
       - attachment references
    4. documents 업데이트
    5. document_versions 생성
    6. document_links 재생성
    7. document_tags 재생성
    8. search index 업데이트
    9. graph cache 갱신

    ### 7.2 읽기 흐름

    1. 사용자가 문서 요청
    2. 권한 확인
    3. Markdown 반환
    4. 렌더링용 HTML 또는 AST 생성
    5. Backlinks / Outgoing links / Local graph 조회
    6. 클라이언트 렌더링

    ### 7.3 검색 흐름

    1. 검색어 입력
    2. 권한 범위 계산
    3. title/content/tags/properties 검색
    4. 접근 가능한 문서만 반환
    5. 하이라이트 스니펫 제공

    ### 7.4 Graph 흐름

    1. 문서 링크 테이블 조회
    2. 권한 있는 문서만 필터링
    3. 현재 문서 중심 depth 1 또는 2 그래프 생성
    4. 노드/엣지 JSON 반환
    5. React Flow 또는 Cytoscape.js로 렌더링

    ## 8. UI 구조

    ### 8.1 기본 레이아웃

    왼쪽 사이드바:

    - Workspace switcher
    - Search
    - File tree
    - Favorites
    - Recent docs
    - Tags

    중앙:

    - Editor / Preview
    - Split mode
    - Document tabs

    오른쪽 사이드바:

    - Backlinks
    - Outgoing links
    - Properties
    - Outline
    - Comments
    - Version history

    상단:

    - Quick switcher
    - Command palette
    - Share / permissions
    - Save status
    - User menu

    ### 8.2 핵심 UX

    - Cmd/Ctrl + K: Quick switcher
    - Cmd/Ctrl + P: Command palette
    - `[[` 입력 시 문서 자동완성
    - `#` 입력 시 태그 자동완성
    - `/` 입력 시 block command menu
    - 깨진 링크 클릭 시 문서 생성
    - 문서 제목 변경 시 링크 처리 옵션 제공

    ## 9. 개발 로드맵

    ### Phase 0: 제품/기술 기획

    목표:

    - 사내 위키 MVP 범위 확정
    - 기존 문서 시스템 조사
    - 사용자 페르소나 정의

    산출물:

    - PRD
    - IA
    - 데이터 모델
    - 권한 정책
    - MVP 와이어프레임

    ### Phase 1: 프로젝트 기반 구축

    작업:

    - Next.js + TypeScript 세팅
    - Tailwind + shadcn/ui 세팅
    - Prisma + PostgreSQL 세팅
    - Auth.js 세팅
    - 기본 레이아웃 구현
    - workspace/document 기본 모델 구현

    완료 기준:

    - 로그인 가능
    - 워크스페이스 생성 가능
    - 빈 문서 생성 가능

    ### Phase 2: 문서 CRUD + Markdown Editor

    작업:

    - 문서 목록
    - 문서 생성/수정/삭제
    - CodeMirror 6 에디터
    - Markdown preview
    - 이미지 업로드
    - document_links 테이블 구축
    - backlink 패널
    - broken link 처리

    완료 기준:

    - A 문서에서 B 문서를 링크하면 B 문서의 backlink에 A가 표시됨
    - 존재하지 않는 문서 링크 클릭 시 새 문서 생성 가능

    ### Phase 4: Search / Tags / Properties

    작업:

    - PostgreSQL FTS
    - tag parser
    - YAML frontmatter parser
    - properties sidebar
    - 검색 UI

    완료 기준:

    - 제목/본문/태그 검색 가능
    - 권한 없는 문서는 검색 결과에 나오지 않음

    ### Phase 5: 권한 / 버전 / 감사 로그

    작업:

    - workspace role
    - document permission
    - document version history
    - restore
    - audit log

    완료 기준:

    - viewer는 수정 불가
    - editor는 수정 가능
    - 이전 버전 복구 가능
    - 누가 무엇을 바꿨는지 조회 가능

    ### Phase 6: Graph View

    작업:

    - local graph API
    - graph renderer
    - depth 설정
    - tag/document 필터
    - orphan/broken node 표시

    완료 기준:

    - 현재 문서 기준 연결 문서 시각화 가능
    - 권한 없는 문서는 그래프에서 제외됨

    ### Phase 7: 사내 운영 기능

    작업:

    - 문서 템플릿
    - 문서 소유자
    - 리뷰 기한
    - 댓글
    - Slack/Teams 알림
    - 관리자 콘솔

    완료 기준:

    - 팀별 표준 문서 템플릿 사용 가능
    - 오래된 문서 리뷰 요청 가능

    ## 10. 우선순위 백로그

    ### P0

    - 로그인
    - 워크스페이스
    - 문서 CRUD
    - Markdown editor
    - preview
    - wiki link parser
    - backlinks
    - search
    - basic permission
    - version history

    ### P1

    - tags
    - properties
    - local graph
    - comments
    - file upload
    - favorites
    - recent docs
    - templates
    - audit logs

    ### P2

    - real-time collaboration
    - global graph
    - canvas
    - advanced query/dataview
    - public/internal publish
    - SSO/SAML
    - import/export
    - AI search/summarization

    ## 11. 사내 위키 특화 기능 아이디어

    ### 11.1 문서 건강도 점수

    다음 요소를 기반으로 문서 품질 점수를 계산한다.

    - 마지막 수정일
    - backlink 수
    - broken link 수
    - owner 존재 여부
    - 리뷰 기한 초과 여부
    - 검색 유입 대비 클릭률

    ### 11.2 지식 사일로 탐지

    - 특정 팀 문서만 연결되어 있고 다른 팀과 연결이 없는 클러스터 탐지
    - 고립 문서 표시

    ### 11.3 신규 입사자 온보딩 맵

    - 역할별 필수 문서 그래프
    - “이 문서를 읽은 다음 읽을 문서” 추천

    ### 11.4 장애/프로젝트 회고 연결

    - 장애 문서와 관련 서비스, 담당자, 대응 문서 자동 연결

    ### 11.5 문서 리뷰 워크플로우

    - Draft
    - Review
    - Approved
    - Deprecated

    ### 11.6 AI 보조 기능

    - 문서 요약
    - 중복 문서 탐지
    - 관련 문서 추천
    - 오래된 문서 업데이트 제안
    - 자연어 검색

    ### 11.7 Git-like export

    - Workspace 전체를 Markdown zip으로 export
    - vendor lock-in 방지
    - Obsidian과 호환 가능한 구조 제공

    ## 12. 주요 리스크

    ### 12.1 기술 리스크

    - Markdown 렌더링 XSS
    - 권한 기반 검색 필터링 누락
    - 문서명 변경 시 링크 깨짐
    - 실시간 협업 도입 시 복잡도 급증
    - Graph 성능 문제
    - 첨부파일/이미지 관리 복잡도

    ### 12.2 제품 리스크

    - Obsidian처럼 만들면 일반 직원에게 너무 어려울 수 있음
    - Notion/Confluence 대비 차별화가 부족할 수 있음
    - 그래프뷰가 예쁘지만 실제 사용 빈도는 낮을 수 있음
    - 문서 품질 관리는 기능만으로 해결되지 않음

    ### 12.3 운영 리스크

    - 권한 정책이 복잡해질 수 있음
    - 온프레미스 요구가 생기면 배포 난이도 증가
    - SSO/SAML 요구가 빨리 등장할 가능성 높음

    ## 13. 당장 착수할 개발 순서

    1. Next.js 프로젝트 생성
    2. PostgreSQL + Prisma 연결
    3. Auth.js 로그인 구현
    4. workspace/document 모델 생성
    5. 문서 CRUD API 구현
    6. 기본 3-column layout 구현
    7. CodeMirror editor 붙이기
    8. Markdown preview 붙이기
    9. `[[wiki link]]` 파서 구현
    10. document_links 테이블 저장
    11. backlink sidebar 구현
    12. PostgreSQL FTS 검색 구현
    13. role 기반 권한 추가
    14. version history 추가
    15. local graph 구현

    ## 14. 최소 데모 목표

    사용자가 로그인해서 Markdown 문서를 만들고, `[[다른 문서]]`로 연결하고, 연결된 문서의 backlink와 local graph를 볼 수 있다.

    이 데모가 나오면 Obsidian 클론의 핵심 가치는 검증 가능하다.
