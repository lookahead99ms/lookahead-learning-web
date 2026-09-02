# Security Policy

## Reporting a vulnerability

Do not disclose suspected vulnerabilities, exposed credentials, or private-content leaks in a public issue.

Use GitHub private vulnerability reporting from the repository's **Security** tab. If that option is unavailable, contact the maintainer through a private channel listed on the repository owner's GitHub profile.

Include the affected route or file, reproduction steps, impact, and any suggested mitigation. Do not include real credentials or proprietary curriculum in the report.

## Supported version

Security fixes target the current `main` branch. This project is under active development and does not yet publish a long-term support matrix.

## Content incidents

If private curriculum or a credential reaches the public repository, treat the event as an exposure even after deleting the file. Restrict repository visibility, rotate affected credentials, remove the material from public Git history, and account for existing clones, Actions artifacts, caches, and forks.
