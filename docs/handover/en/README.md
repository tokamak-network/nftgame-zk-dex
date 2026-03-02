# NFT Gaming ZK-DEX Handover Document

> Date: 2026-03-03
> Target: Newly joined developers
> Estimated Onboarding Period: 3~7 days

---

## Document Structure

| # | Document | Description | Reading Order |
|---|---|---|---|
| 1 | [Project Overview](./01-project-overview.md) | Purpose, target users, core features, tech stack | Day 1 |
| 2 | [System Architecture](./02-architecture.md) | 3-layer diagram, external dependencies | Day 1 |
| 3 | [Directory Structure](./03-directory-structure.md) | Folder tree, quick reference for key files | Day 1 |
| 4 | [Core Business Logic](./04-business-logic.md) | UTXO Note system, F1/F4/F5/F8/F9 data flow | Day 2~3 |
| 5 | [Data Structures](./05-data-structures.md) | On-chain state, Note hash, localStorage, caching | Day 3~4 |
| 6 | [API Reference](./06-api-reference.md) | Contract functions, full event list | Day 3~4 (Ref) |
| 7 | [Deployment & Ops](./07-deployment-ops.md) | Env setup, execution, testing, CI/CD | Day 1~2 |
| 8 | [Security Considerations](./08-security.md) | Cryptography, Trusted Setup, Contract, Frontend security | Day 5 |
| 9 | [Known Issues / Tech Debt](./09-known-issues.md) | Issue list by severity (Critical~Low) | Day 5~6 |
| 10 | [Future Improvements + Onboarding Guide](./10-improvements-onboarding.md) | Roadmaps, 7-day checklist | Day 1 + Day 7 |

---

## Recommended Reading Order

### Day 1 (Quick Overview)
1. **This Document** (README) - Understand full structure
2. [01-Project Overview](./01-project-overview.md) - "What is this project?"
3. [07-Deployment & Ops](./07-deployment-ops.md) - Try running locally first
4. [10-Onboarding Guide](./10-improvements-onboarding.md) - Check daily checklists

### Day 2~3 (Deep Understanding)
5. [02-System Architecture](./02-architecture.md) - Overall structure and layers
6. [03-Directory Structure](./03-directory-structure.md) - Where files are located
7. [04-Core Business Logic](./04-business-logic.md) - Most important document

### Day 4~5 (Advanced)
8. [05-Data Structures](./05-data-structures.md) - On-chain/Off-chain state
9. [06-API Reference](./06-api-reference.md) - Reference as needed
10. [08-Security Considerations](./08-security.md) - What is safe and what is risky

### Day 6~7 (Hands-on)
11. [09-Known Issues](./09-known-issues.md) - Risk factors you must know
12. [10-Future Improvements](./10-improvements-onboarding.md) - Tasks to be done next

---

## Related Existing Documents

| Document | Path | Description |
|---|---|---|
| README | `../../README.md` | Main project document (English) |
| Setup Guide | `../setup.md` | Detailed environment installation guide |
| Testing Guide | `../testing.md` | Test execution guide |
| Circuit Architecture | `../circuits.md` | Detailed ZK circuit design |
| Contract Architecture | `../contracts.md` | Detailed smart contract design |
