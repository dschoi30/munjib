# Security policy

Security fixes target the current `main` branch. Preparation contracts and
readiness documents do not certify that a production control is active.

## Reporting a vulnerability

Do not publish credentials, user data, exploit payloads against a live service,
or sensitive operational evidence in issues, discussions, or pull requests.
Use GitHub's **Security → Report a vulnerability** when private vulnerability
reporting is available. If it is unavailable, ask the maintainer to arrange a
private reporting channel without including vulnerability details.

A report should include the affected commit, a minimal reproduction using
synthetic data, the expected behavior, and the observed behavior. Test only
systems you own or have permission to assess.

## Credentials and local fixtures

Development seed users, example credentials, and test secrets are public test
fixtures. Never reuse them for staging, production, OAuth, or AI providers.
`pnpm db:seed` is restricted to a development environment. Production account
bootstrap and credential rotation are separate operator procedures.

Real `.env` files, private keys, tokens, database dumps, attachments, and private
audit reports must remain outside Git. Ignoring a file does not remove its
contents from previous commits, pull requests, or Actions logs.

## Secret scanning

Install Gitleaks 8.30.1, then run:

```bash
bash scripts/security/scan-secrets.sh history
bash scripts/security/scan-secrets.sh staged
```

Set `GITLEAKS_BIN` to an absolute binary path if it is not on `PATH`.
The scanner writes fully redacted reports to a private temporary directory.
The secret-scan workflow runs on GitHub-hosted runners with read-only repository
permissions and does not upload reports. Exact historical fixture fingerprints
in `.gitleaksignore` have been manually classified; do not add a broad baseline
or suppress an unreviewed finding.

Automated scanning cannot establish that a credential has been rotated or
identify every weak password. Manual review and operator confirmation remain
necessary before changing repository visibility.
