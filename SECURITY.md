# Security policy

## Supported versions

Security fixes are applied to the latest version on the `main` branch.

## Reporting a vulnerability

Do not disclose suspected vulnerabilities, credentials, or user data in a public issue.

Use GitHub's private vulnerability reporting form:
https://github.com/Perlitten/bpmn-builder/security/advisories/new

Include reproduction steps, affected routes or packages, expected impact, and any suggested mitigation.

If private reporting is unavailable, contact the repository owner through their GitHub profile first and wait for a private channel before sharing sensitive details.

## Response targets

- acknowledgement: within 3 business days;
- initial severity assessment: within 7 business days;
- remediation target: critical issues within 7 days, high issues within 30 days.

These targets are goals rather than a warranty.

## Accepted dependency risks

Temporary dependency exceptions must be narrowly scoped, documented here, and
given an expiry date in `osv-scanner.toml` so the scanner continues to report
every unrelated advisory.

### GHSA-jmr9-qjv8-65gv / CVE-2026-56876

- Affected package: `extract-zip@2.0.1`.
- Dependency path: `@lhci/cli -> lighthouse -> puppeteer-core ->
  @puppeteer/browsers -> extract-zip`.
- Scope: development and CI performance tooling only; the package is absent
  from the production dependency graph.
- Exposure: the repository does not pass user-controlled archives to
  `extract-zip`; Lighthouse obtains browser artifacts from its configured
  upstream tooling.
- Upstream status: no patched `extract-zip` release is currently available.
- Compensating controls: production dependency auditing remains mandatory and
  all other OSV findings remain enabled.
- Review deadline: 2026-11-20, or immediately if a patched release becomes
  available.
