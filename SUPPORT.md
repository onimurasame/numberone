# Support & Troubleshooting

## Self-Service Diagnostics

Before opening an issue, run Number One's built-in diagnostic and cryptographic verification commands in your workspace:

```bash
# Diagnose Node runtime, Git hooks, daemon status, and persistence configuration
n1 doctor

# Verify SHA-256 hash chain, fallback blobs, and projection snapshot digest
n1 verify --local-only
```

## Documentation Resources

- **Interactive Portal & Archify Visual Suite**: `https://shadow-software-platform.github.io/numberone/`
- **Comprehensive System Manual**: [`README.md`](./README.md)
- **All-Harness & Generic Installation Guide**: [`docs/INSTALLATION.md`](./docs/INSTALLATION.md)
- **On-Premises & Air-Gapped Enterprise Guide**: [`docs/ONPREM.md`](./docs/ONPREM.md)
- **Complete Code & API Reference**: [`docs/CODE_REFERENCE.md`](./docs/CODE_REFERENCE.md)
- **Exhaustive Technical Glossary**: [`docs/GLOSSARY.md`](./docs/GLOSSARY.md)

## Community & Bug Reports

- **Questions, Harness Configurations & Architecture Discussions**: Use [GitHub Discussions](https://github.com/Shadow-Software-Platform/numberone/discussions).
- **Deterministic Bugs & Feature Proposals**: Open a structured [GitHub Issue](https://github.com/Shadow-Software-Platform/numberone/issues/new/choose).
- **Security Vulnerabilities**: Follow [`SECURITY.md`](./SECURITY.md) and use [Private Vulnerability Reporting](https://github.com/Shadow-Software-Platform/numberone/security/advisories/new).
