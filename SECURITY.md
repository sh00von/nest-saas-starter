# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub: **Security → Report a vulnerability** on this repository (a private security advisory). Include:

- what the issue is and its impact,
- steps to reproduce or a proof of concept,
- affected version or commit.

You can expect an acknowledgement within 3 business days. Once a fix is ready we will publish an advisory and credit you, unless you prefer to stay anonymous.

## Supported versions

Only the latest commit on `main` receives security fixes. Projects started from this template should pull fixes into their own code.

## Scope

In scope: the code in this repository (auth, sessions, tokens, billing webhook, uploads, etc.).
Out of scope: vulnerabilities in dependencies with no exploitable path here (report them upstream), and issues requiring a compromised server or leaked secrets.
