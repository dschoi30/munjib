# 문집 · Munjib

Markdown으로 문서를 작성하고, 위키 링크와 그래프로 지식을 연결하는 워크스페이스 기반 문서 위키입니다. 문서·폴더 관리, 권한, 변경 이력과 AI 질의응답을 하나의 Next.js 애플리케이션에서 제공합니다.

## 주요 기능

- **문서 작성**: Markdown 편집·미리보기, 제목별 접기, 목차, 속성·태그, 파일 첨부, Markdown 가져오기
- **지식 탐색**: `[[위키 링크]]`, 백링크, 지식 그래프, 검색, 즐겨찾기, 최근 문서와 문서 탭
- **협업과 관리**: 워크스페이스·문서 권한, 댓글, 버전 복원, 감사 로그, 문서 보관과 보존 기간 설정
- **Ask AI**: 현재 저장된 문서를 읽고 답변과 출처 제공
- **Workspace AI**: 읽기 권한이 있는 워크스페이스 문서를 검색하는 RAG 대화와 답변 스트리밍

AI는 저장된 문서를 기준으로 동작합니다. 편집 중인 미저장 내용은 답변에 반영되지 않습니다.

## 기술 구성

| 영역 | 구성 |
| --- | --- |
| 애플리케이션 | Next.js 15 App Router, React 19, TypeScript |
| 편집기·UI | CodeMirror, Tailwind CSS, Radix UI, react-force-graph |
| 데이터 | PostgreSQL 16 + pgvector, Prisma 6 |
| 인증 | NextAuth, 이메일·비밀번호 및 Google OAuth |
| AI | LangChain, Ollama / OpenAI / OpenAI-compatible provider |
| 관측성 | Sentry, 선택적 Langfuse tracing |
| 검증 | Vitest, Testing Library, Playwright |
| 실행·배포 | pnpm, Docker Compose, GitHub Actions |

정확한 의존성 버전은 [package.json](package.json)과 [pnpm-lock.yaml](pnpm-lock.yaml)을 기준으로 합니다.

## 로컬에서 시작하기

Node.js 22, pnpm 10.28.1, Docker Compose가 필요합니다. 아래는 **DB만 Docker로 실행하고 앱은 호스트에서 실행**하는 개발 환경 기준입니다.

### 1. 의존성과 환경 변수 준비

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
```

기존 `.env`가 있다면 복사하는 대신 [.env.example](.env.example)과 비교해 필요한 항목만 추가합니다. `NEXTAUTH_SECRET`은 로컬용 임의 값으로 바꿉니다.

| 환경 변수 | 로컬 설정 |
| --- | --- |
| `DATABASE_URL` | 예제 기준 `localhost:55432`의 PostgreSQL |
| `NEXTAUTH_URL` | `http://localhost:3000` |
| `NEXTAUTH_SECRET` | 로컬 인증용 secret |
| `MUNJIB_DEPLOYMENT_ENV` | `development` |
| `MUNJIB_ENABLE_DEV_LOGIN` | 개발용 이메일 로그인 사용 시 `true` |

### 2. DB 초기화

```bash
docker compose up -d --wait postgres
pnpm run db:generate
pnpm run db:migrate
pnpm run db:seed
```

`db:migrate`는 Prisma 개발 마이그레이션 후 RAG 벡터 인덱스를 생성합니다. 일반 PostgreSQL 이미지 대신 저장소의 pgvector 이미지를 사용해야 합니다. Seed는 개발용 사용자와 예제 워크스페이스를 준비하며, staging·production에서는 차단됩니다.

### 3. 앱 실행

```bash
pnpm dev
```

[로컬 로그인 화면](http://localhost:3000/login)에서 개발용 이메일 로그인으로 `owner@example.com`, `editor@example.com`, `viewer@example.com` 계정을 사용할 수 있습니다. 기본 예제 워크스페이스는 `company-handbook`입니다.

`55432` 포트가 사용 중이면 `.env`에 `POSTGRES_PORT`를 지정하고 `DATABASE_URL`의 포트도 함께 변경합니다.

### 앱도 Docker에서 실행하려면

위 DB 초기화를 마친 뒤 다음 개발용 override를 사용합니다.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

호스트의 Ollama에 연결한다면 `.env`의 `MUNJIB_OLLAMA_BASE_URL`을 `http://host.docker.internal:11434`로 변경합니다. 컨테이너 내부 DB 연결은 `postgres:5432`를 사용하며, 별도 설정이 필요하면 `DOCKER_DATABASE_URL`을 지정합니다.

기본 Compose의 `web`은 운영용 secret 파일과 인증 설정을 요구하므로 로컬 개발에서는 위 override를 함께 사용합니다. 자세한 설정은 [로컬 개발 가이드](wiki/Local%20Development%20Workflow.md)를 참고하세요.

## AI 설정

일반 문서 기능은 AI provider를 준비하지 않아도 사용할 수 있습니다. AI 기능을 사용하려면 [.env.example](.env.example)의 provider 설정을 채웁니다.

기본 구성은 Ollama의 `gemma4:e4b` 채팅 모델과 `bge-m3` 임베딩 모델입니다. Ollama를 설치하고 실행한 환경에서 모델을 준비합니다.

```bash
ollama pull gemma4:e4b
ollama pull bge-m3
```

| 채팅 provider | 주요 서버 환경 변수 |
| --- | --- |
| Ollama | `MUNJIB_RAG_CHAT_PROVIDER=ollama`, `MUNJIB_OLLAMA_BASE_URL` |
| OpenAI | `MUNJIB_RAG_CHAT_PROVIDER=openai`, `OPENAI_API_KEY` |
| OpenAI-compatible | `MUNJIB_RAG_CHAT_PROVIDER=openai-compatible`, `MUNJIB_OPENAI_COMPATIBLE_BASE_URL`, 필요 시 `MUNJIB_OPENAI_COMPATIBLE_API_KEY` |

각 provider에 맞는 `MUNJIB_RAG_CHAT_MODEL`도 설정합니다. API key와 endpoint는 서버에서 관리하며, 화면의 AI 설정은 서버에서 사용 가능한 provider와 채팅 모델을 선택하는 용도입니다.

현재 Workspace AI 벡터 인덱스는 **Ollama `bge-m3`, 1024차원** 기준입니다. 채팅 모델 변경과 임베딩 변경은 별개이며, 임베딩 설정만 바꿔 기존 인덱스를 그대로 사용할 수는 없습니다. Ask AI는 현재 문서를 직접 읽고, Workspace AI는 문서 청크 검색을 사용합니다.

Langfuse는 선택 사항입니다. 기본 `metadata` 모드는 LangChain callback을 연결하지 않으며, 본문을 포함하는 전체 tracing은 명시적으로 `full`을 설정할 때 활성화됩니다. 상세 흐름과 설정은 [AI/RAG 가이드](wiki/RAG%20Process%20Workflow.md)에 있습니다.

## 개발·검증 명령

| 명령 | 용도 |
| --- | --- |
| `pnpm dev` | 개발 서버 |
| `pnpm build` / `pnpm start` | 빌드 / 빌드된 앱 실행 |
| `pnpm test` | Vitest 테스트 |
| `pnpm exec tsc --noEmit --pretty false` | TypeScript 검사 |
| `pnpm test:e2e` | Seed 실행 후 Playwright E2E |
| `pnpm test:e2e:ui` | Playwright UI 모드 |
| `pnpm run security:auth-preflight` | 인증 환경 설정 검사 |
| `pnpm run test:security-runtime` | 운영 환경에 준하는 인증·RSC smoke 검사 |

E2E는 개발용 DB와 Chromium이 필요합니다. 최초 실행 전 `pnpm exec playwright install chromium`을 실행합니다. 기본 설정은 테스트 서버를 직접 시작하므로 기존 개발 서버의 `3000` 포트를 비워 둡니다.

## 저장소 구조

```text
app/          페이지, API route, server action
components/   편집기, 탐색, 그래프, 설정, AI 화면
lib/          도메인 서비스, 권한, 인증, 위키 링크, RAG
prisma/       데이터 모델, 마이그레이션, seed
scripts/      DB·보안·배포·Wiki 관리 명령
tests/        단위·컴포넌트·통합·E2E 테스트
deploy/       배포 및 운영 구성
docs/         운영 runbook, 설계, 구현 계획
wiki/         프로젝트 지식과 워크플로우
raw/sources/  보존 대상 원본 근거
```

## 상세 문서

- [Wiki 인덱스](wiki/index.md): 프로젝트 지식 탐색의 시작점
- [프로젝트 구조 안내](wiki/Project%20Structure%20Onboarding.md): 기능별 코드 진입점과 데이터 흐름
- [로컬 개발](wiki/Local%20Development%20Workflow.md): DB, Docker, 환경 변수, 관리 명령
- [인증과 권한](wiki/Auth%20And%20Permissions%20Workflow.md): 로그인과 접근 제어
- [문서 편집](wiki/Document%20Editing%20Workflow.md): 저장, 첨부, 버전, 메타데이터
- [AI/RAG](wiki/RAG%20Process%20Workflow.md): Ask AI와 Workspace AI의 처리 흐름
- [CI/CD와 관측성](wiki/CI%20CD%20And%20Monitoring%20Workflow.md): 빌드, 배포, 모니터링
- [운영 배포 runbook](docs/runbooks/private-oci-self-hosted-runner.md): private OCI runner 설치·배포·복구

## 기여 워크플로우

프로젝트 규칙은 [AGENTS.md](AGENTS.md)를 따릅니다. 코드 검색 전에는 [Wiki 인덱스](wiki/index.md) 또는 `pnpm wiki:find "<topic>"`에서 관련 문서를 먼저 확인합니다.

새 기능을 시작할 때는 `pnpm wiki:feature-start "<feature title>"`로 이슈를 만들고, 변경으로 생긴 지식은 관련 Wiki에 반영합니다. 커밋 전 Wiki 동기화와 PR 리뷰 절차는 [Wiki 유지보수 가이드](wiki/Wiki%20Maintenance%20Automation.md)에 정리되어 있습니다.
