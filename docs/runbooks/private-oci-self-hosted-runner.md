# Private OCI Self-Hosted Runner 운영 가이드

> Issue #234 이후의 전환 절차는 [비공개 운영 저장소 배포](private-operations-delivery.md)를 따른다.
> 아래의 앱 저장소 runner 등록·workflow 설명은 과거 설치 근거다.
> 앱 저장소에 새 운영 runner를 등록하지 않는다.

이 문서는 공개 SSH를 다시 열지 않고, 현재 단일 OCI VM에서 GitHub Actions의 production 배포만 실행하는 MVP 절차다. GitHub-hosted runner는 계속 CI를 담당한다.

## 0. 시작 전 확인

다음 조건을 모두 만족할 때만 시작한다.

- GitHub repository `dschoi30/munjib`는 private이다.
- 운영자 SSH 접속은 OCI Bastion을 통해서만 가능하다.
- OCI boot volume backup, PostgreSQL logical dump, attachment archive와 off-VM copy가 완료됐다.
- `/etc/munjib/env`가 존재한다.
- `/etc/munjib/secrets/nextauth-current`가 존재한다.
- `GOOGLE_CLIENT_ID`를 사용한다면 `/etc/munjib/secrets/google-client-current`도 존재한다.
- 현재 정상 운영 중인 Git commit SHA를 확인할 수 있다.

다음 값은 화면 공유, GitHub issue/PR, wiki, 명령 기록에 붙여 넣지 않는다.

- runner 등록 token 또는 등록 명령 전체
- GitHub job token
- `/etc/munjib/env` 내용
- NextAuth/Google secret 내용
- private key

runner를 중지하거나 GitHub에서 제거해도 현재 실행 중인 Munjib 컨테이너는 중지되지 않는다. 자동 배포만 멈춘다.

## 1. runner 전용 계정 만들기

Bastion으로 OCI에 접속한 터미널에서 실행한다.

```bash
sudo useradd --system --create-home --home-dir /opt/actions-runner --shell /usr/sbin/nologin munjib-runner
sudo install -d -o munjib-runner -g munjib-runner -m 0700 /opt/actions-runner
```

정상 결과:

```bash
id munjib-runner
id -nG munjib-runner
```

- 사용자 이름이 `munjib-runner`다.
- 그룹 목록에 `docker`가 없다.
- `/home/ubuntu/.ssh`나 별도 SSH key를 이 사용자에게 만들지 않는다.

이미 사용자가 존재한다는 오류가 나오면 새로 만들지 말고 위의 `id` 검사부터 한다.

## 2. 공식 runner package 설치

1. GitHub에서 `Settings → Actions → Runners → New self-hosted runner`를 연다.
2. `Linux`와 `ARM64`를 선택한다.
3. GitHub가 그 시점에 표시하는 versioned download 명령과 SHA-256 검증 명령을 사용한다.
4. 버전은 이 문서에서 복사하지 않는다. 최신 GitHub 화면의 값을 사용한다.
5. package download와 압축 해제는 `/opt/actions-runner`에서 `munjib-runner` 사용자로 실행한다.

예시 실행 형태만 다음과 같다. `<GitHub 화면의 명령>` 부분을 그대로 대체한다.

```bash
cd /opt/actions-runner
sudo -u munjib-runner <GitHub 화면의 download 명령>
sudo -u munjib-runner <GitHub 화면의 SHA-256 검증 명령>
sudo -u munjib-runner <GitHub 화면의 압축 해제 명령>
```

checksum이 일치하지 않으면 즉시 중지한다. 파일을 실행하거나 등록하지 않는다.

## 3. 이 repository에만 runner 등록

GitHub 화면의 일회성 token을 현재 Bastion 세션의 shell 변수에만 넣는다. 명령 history에 token이 남지 않도록 leading space가 history 제외로 설정된 shell을 쓰거나 안전하게 읽는다.

```bash
read -r -s RUNNER_REGISTRATION_TOKEN
printf '\n'
sudo -u munjib-runner /opt/actions-runner/config.sh \
  --url https://github.com/dschoi30/munjib \
  --token "$RUNNER_REGISTRATION_TOKEN" \
  --name munjib-production-oci \
  --labels munjib-production \
  --unattended \
  --replace
unset RUNNER_REGISTRATION_TOKEN
```

service를 설치하고 시작한다.

```bash
cd /opt/actions-runner
sudo ./svc.sh install munjib-runner
sudo ./svc.sh start
sudo ./svc.sh status
```

GitHub repository의 `Settings → Actions → Runners`에서 다음을 확인한다.

- 이름: `munjib-production-oci`
- 상태: `Online`
- labels: `self-hosted`, `linux`, `ARM64`, `munjib-production`

runner는 GitHub로 outbound HTTPS 443 연결을 만든다. OCI security list, NSG, host firewall에 runner용 inbound port를 추가하지 않는다.

## 4. 검토된 wrapper와 sudoers 설치

PR에서 검토한 정확한 commit을 `/home/ubuntu/munjib`에 준비한 뒤 실행한다. 아직 workflow를 merge하지 않는다.

```bash
cd /home/ubuntu/munjib
sha256sum scripts/deploy/munjib-deploy.sh deploy/sudoers/munjib-actions-runner

sudo install -o root -g root -m 0755 \
  scripts/deploy/munjib-deploy.sh \
  /usr/local/sbin/munjib-deploy

sudo install -o root -g root -m 0440 \
  deploy/sudoers/munjib-actions-runner \
  /etc/sudoers.d/munjib-actions-runner

sudo visudo -cf /etc/sudoers.d/munjib-actions-runner
sudo install -d -o root -g root -m 0755 /var/lib/munjib/deploy

web_container="$(sudo docker compose \
  --env-file /etc/munjib/env ps -q web)"
test -n "$web_container"
running_sha="$(sudo docker inspect "$web_container" \
  --format '{{range .Config.Env}}{{println .}}{{end}}' | \
  sed -n 's/^SENTRY_RELEASE=//p' | head -n 1)"
printf '%s\n' "$running_sha" | grep -Eq '^[a-f0-9]{40}$'
git -C /home/ubuntu/munjib merge-base --is-ancestor "$running_sha" origin/main
printf '%s\n' "$running_sha" | \
  sudo tee /var/lib/munjib/deploy/current-sha >/dev/null
sudo chown root:root /var/lib/munjib/deploy/current-sha
sudo chmod 0444 /var/lib/munjib/deploy/current-sha
```

설치본이 검토본과 같은지 다시 확인한다.

```bash
sha256sum scripts/deploy/munjib-deploy.sh /usr/local/sbin/munjib-deploy
sudo cat /var/lib/munjib/deploy/current-sha
printf '%s\n' "$running_sha"
```

두 wrapper hash가 다르거나 두 SHA가 다르면 중지한다. `SENTRY_RELEASE`가 비어
있거나 40자리 SHA가 아니어도 중지하고, 마지막 정상 배포 기록에서 실행 중인
release SHA를 먼저 확인한다. 설치를 위해 checkout한 PR의 `HEAD`를 대신 기록하면
안 된다. `current-sha`는 반드시 현재 정상 운영 중이라고 독립 확인한 SHA여야 한다.

## 5. 최소 권한과 네트워크 확인

```bash
sudo ss -lntp
id munjib-runner
id -nG munjib-runner
sudo -u munjib-runner test ! -r /etc/munjib/env
sudo visudo -cf /etc/sudoers.d/munjib-actions-runner
sudo -l -U munjib-runner
```

완료 기준:

- runner 때문에 새 public listener가 생기지 않았다.
- `munjib-runner`는 `docker` 그룹에 없다.
- `munjib-runner`는 `/etc/munjib/env`를 직접 읽을 수 없다.
- password 없이 실행 가능한 명령은 `/usr/local/sbin/munjib-deploy` 하나뿐이다.

generic `bash`, `sh`, `docker`, `git`, `systemctl`, editor 또는 파일 복사 명령이 sudo 목록에 보이면 merge하지 않는다.

## 6. workflow 전환

1. source branch를 push하고 draft PR을 연다.
2. review와 CI가 성공해도 아직 merge하지 않는다.
3. 이 문서의 runner, wrapper, sudoers 설치와 readiness 검사를 완료한다.
4. runner가 GitHub에서 Online이고 네 label이 정확할 때만 PR을 ready로 전환한다.
5. 명시적인 merge 승인 후 merge한다.
6. 첫 `main` run에서 CI 후 Deploy job이 runner에 배정되는지 확인한다.
7. job 출력의 `deployed_sha=<main-sha>`를 확인한다. token이나 secret 값은 출력되면 안 된다.

운영 `main` workflow와 deploy job은 실행 중 취소되지 않는다. 새 `main` push가
도착해도 현재 배포가 health check와 SHA 기록을 마친 뒤 다음 배포가 시작된다.
Wrapper는 기록된 `current-sha`가 배포 대상 SHA의 조상일 때만 진행하므로, 과거
`main` workflow를 재실행해도 운영 버전을 이전 commit으로 되돌릴 수 없다. 의도한
rollback은 Actions 재실행이 아니라 아래 Bastion 수동 복구 절차로 판단·수행한다.
성공한 배포는 현재와 직전 `munjib-web:<sha>` 이미지 태그만 남기고 더 오래된
Munjib web 태그를 정리한다. 최초 전환에서 직전 SHA 태그가 아직 없다면 기존
`munjib-web:latest`를 한 세대 보존하고, 다음 성공 배포부터 SHA 태그 2세대
보존으로 전환한다. 다른 repository의 Docker 이미지는 이 정리 대상이 아니다.

첫 배포 후 Bastion에서 독립 확인한다.

```bash
expected_sha="$(cat /var/lib/munjib/deploy/current-sha)"
test "$(git -C /home/ubuntu/munjib rev-parse HEAD)" = "$expected_sha"
sudo docker compose --env-file /etc/munjib/env ps
curl --fail --silent --show-error --location --max-time 20 \
  --header 'Host: munjib.andrewchoi.link' http://127.0.0.1:3000/ >/dev/null
curl --fail --silent --show-error --location --max-time 20 \
  https://munjib.andrewchoi.link/ >/dev/null
printf 'verified_sha=%s\n' "$expected_sha"
```

그다음 운영자 Mac에서 기본 브랜치 전용 repository dispatch를 보낸다.

```bash
gh api --method POST repos/dschoi30/munjib/dispatches \
  -f event_type=production-runner-smoke
```

이 이벤트는 기본 브랜치의 `Production runner smoke` workflow만 실행한다. branch를
선택하는 `workflow_dispatch`는 사용하지 않는다. workflow는 운영 변경 없이 identity,
architecture, Docker group 부재, outbound/public HTTPS만 확인한다.

첫 deploy와 smoke가 모두 성공한 뒤에만 GitHub repository의 오래된 `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT`, `DEPLOY_PATH`, `DEPLOY_SSH_KEY` secrets를 삭제한다. 앱에서 사용 중일 수 있는 다른 secret은 삭제하지 않는다.

## 7. 실패 시 중단과 복구

Deploy job이 queued 상태로 남으면 다음부터 확인한다.

```bash
cd /opt/actions-runner
sudo ./svc.sh status
```

runner가 offline이거나 wrapper가 실패하면:

1. self-hosted deploy job을 비활성화한다.
2. 현재 실행 중인 컨테이너는 그대로 둔다.
3. 필요하면 Bastion을 통해 승인된 `main` SHA를 수동 배포한다.
4. 자동 배포 복구를 위해 public SSH를 다시 열지 않는다.

runner 중지:

```bash
cd /opt/actions-runner
sudo ./svc.sh stop
```

그 후 GitHub `Settings → Actions → Runners`에서 runner를 제거할 수 있다. 침해가 의심되면 runner 등록을 제거하고, runner directory를 재설치하며, runner가 접근할 수 있었던 credential을 회전한다.

DB migration은 자동 역방향 rollback하지 않는다. 배포 health check 실패 시 wrapper는 실패를 반환하고 이전 `current-sha` 기록을 보존하지만, 이미 적용된 migration은 별도 복구 판단이 필요하다.
