# 익명 Trial AI 보존기간 정리 운영 절차

Issue #212의 일일 quota ledger는 PostgreSQL 시간을 기준으로 다음 기간만 보존한다.

- 방문자 일일 사용량: 현재 KST 날짜를 포함한 최근 35일
- 네트워크·전체 일일 사용량: 현재 KST 날짜를 포함한 최근 8일
- admission lease: `expiresAt`이 DB 현재 시각보다 과거이고, 만료 후 24시간이 지난 row

정리는 네 표에 대한 `SELECT`와 `DELETE`만 필요하며 DDL, quota counter 갱신, 사용자·문서 조회를 하지 않는다. 실행은 한 transaction에서 lease → visitor → network → global 순서로 처리되어 중간 실패 시 전체 rollback된다. 활성 lease는 삭제하지 않는다.

## 내가 작업해야 하는 부분

### 1. dry-run 확인

목적: 삭제 없이 DB 시각, cutoff, 후보 수를 확인한다.

```bash
docker compose run --rm tools pnpm run trial-ai:purge-retention
```

로컬 셸에서는 production과 같은 `DATABASE_URL`을 주입한 뒤 `pnpm run trial-ai:purge-retention`을 실행할 수 있다. 인자 없는 실행은 항상 dry-run이다.

정상 결과: 두 줄이 출력되고 첫 줄은 `dry run: database now=... kst-date=...`, 둘째 줄은 표별 `candidates`와 모두 0인 `deleted`를 표시한다.

완료 기준: KST 날짜와 cutoff가 운영일 기준으로 맞고 후보 수가 예상 범위다. 35일/8일 경계 날짜 row는 후보에 포함되지 않는다.

중단 기준: 명령이 DB 연결·schema 오류로 종료되거나, KST 날짜/cutoff가 예상과 다르거나, 후보 수가 평소 증가량에 비해 급증하면 execute를 실행하지 않는다. DB URL이나 결과 로그에 digest/raw IP/token을 추가 출력하지 않는다.

### 2. 명시적 execute

목적: dry-run에서 확인한 만료 row만 멱등하게 삭제한다.

```bash
docker compose run --rm tools pnpm run trial-ai:purge-retention -- --execute
```

정상 결과: `execute:` 두 줄이 출력되고 `deleted` 수가 직전 dry-run 후보 수와 같거나, 그 사이의 정상 admission/다른 정리 실행 때문에 더 작다. 재실행하면 같은 cutoff의 `deleted`는 0이다.

완료 기준: 명령 exit code가 0이고, 후속 dry-run의 같은 cutoff 후보가 0이다.

중단 기준: exit code가 0이 아니면 transaction은 rollback되므로 반복 실행 전에 DB 오류를 조사한다. `deleted`가 dry-run 후보보다 크거나 활성 요청 장애가 관측되면 scheduler를 중지하고 DB 로그와 배포 SHA를 보존한다.

## 스케줄과 최소 권한

운영 scheduler는 하루 1회 KST 00:30 이후에 위 execute 명령을 호출한다. 배포 자체는 scheduler를 자동 설치하지 않는다. production 유지보수 principal에는 네 Trial 표의 `SELECT`, `DELETE`와 transaction 실행에 필요한 연결 권한만 부여하고 schema 변경 권한은 부여하지 않는다. 애플리케이션 web principal 대신 별도 maintenance role을 사용하는 환경에서는 동일한 `DATABASE_URL` 계약으로 `tools` container에 주입한다.

수동 최초 실행은 반드시 dry-run → execute → dry-run 순서로 한다. 이 명령은 backup이나 migration을 대신하지 않는다.
