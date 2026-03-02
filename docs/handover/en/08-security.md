# 8. Security Considerations

[< Back to Table of Contents](./README.md)

---

## 8.1 Cryptographic Security

| Item | Implementation | Evaluation |
|---|---|---|
| ZK Proof System | Groth16 (SnarkJS) | Mature implementation, production ready |
| Hash Function | Poseidon | ZK-friendly, safety verified |
| Elliptic Curve | BabyJubJub | Efficient computation within ZK circuits |
| Key Management | BabyJubJub EdDSA (sk → pk) | Standard implementation |
| Encryption | ECDH (Note data) | Only recipient can decrypt |
| Double-Spend | Nullifier mapping (On-chain) | Secure |
| VRF | Poseidon(sk, seed) | Deterministic, verifiable |

---

## 8.2 Trusted Setup -- Important

| Item | Current Status | Risk |
|---|---|---|
| Phase 1 | Hermez PTAU (Public Ceremony) | **Secure** |
| Phase 2 | **Single contribution for dev** | **Not for production use** |

### Phase 2 Problems

Currently, Phase 2 contribution in `scripts/compile-circuit.js` runs as follows:

```
snarkjs zkey contribute {zkey_0} {zkey} --name="Dev Contribution" -e="random entropy for dev"
```

**Risk:** Only a single contributor's entropy is used. If this contributor saved the entropy, they can **forge valid proofs**.

**Required Actions (Before Production):**
- Conduct Multi-party Phase 2 Ceremony (Minimum 3 participants)
- Each contributor generates entropy independently
- Publicly verify contribution transcripts

---

## 8.3 Smart Contract Security

| Item | Status | Description |
|---|---|---|
| Reentrancy Guard | Not applied | Low direct risk as there are no state change patterns after external calls |
| Access Control | **Partially insufficient** | Need `msg.sender == admin` checks in `LootBoxOpen.setBoxPrice()`, `withdrawTokens()` (**Verify required**) |
| ERC20 Transfer | `transfer`/`transferFrom` | `safeTransferFrom` not used — may fail on non-standard tokens |
| Integer Overflow | Built-in to Solidity 0.8.20 | Secure |
| Proxy Pattern | Not used | Unupgradable (requires redeployment if bugs found) |
| External Audit | **Not performed** | Essential before production |

### Access Control Details

| Contract | Function | Access Control | Status |
|---|---|---|---|
| LootBoxOpen | `setBoxPrice()` | Needs admin check | **Verify required** |
| LootBoxOpen | `withdrawTokens()` | Needs admin check | **Verify required** |
| CardDrawGame | `withdrawFees()` | Admin check | Implemented |
| Overall | Admin change | None | Fixed to msg.sender on deploy, not transferable |

---

## 8.4 Frontend Security

| Item | Status | Description |
|---|---|---|
| BabyJubJub Key Store | Browser memory (Non-persistent) | Regneration needed on refresh |
| Note Storage | localStorage **Plaintext** | Note hashes exposed if XSS attack occurs |
| CORS Policy | `same-origin` + `require-corp` | For SharedArrayBuffer (snarkjs multi-threading) |
| Input Validation | Basic level | ZK circuit handles final verification |

### Impact of XSS Attack

If Note hashes stored in localStorage are exposed:
- Existence of Note is already public on-chain (NoteCreated event)
- **Secret Key (sk) is not stored in localStorage**, so attacker cannot use the Note
- However, the user's asset holdings may be exposed

---

## 8.5 Blockchain Randomness (F9 Card Game)

### Commit-Reveal Mechanism

| Phase | Attempted Attack | Defense |
|---|---|---|
| Phase 1 (Commit) | Calc drawIndex beforehand to submit favorable deck | drawIndex is decided AFTER commitment |
| Phase 1.5 (PendingReveal) | Predict blockhash | revealBlock = block.number + 2 (not yet mined) |
| Phase 2 (Revealing) | Validator manipulates block | Double randomness with `prevrandao` + `blockhash` |

### Residual Risks

| Risk | Severity | Description |
|---|---|---|
| Validator Collusion | Low | Block abandonment cost for simultaneous prevrandao and blockhash manipulation |
| blockhash Expiry | Medium | Game deadlocks if `finalizeReveal` not called within 256 blocks (~51 mins) |
| Game Recovery | **None** | No recovery mechanism implemented after blockhash expiry |

---

## 8.6 ZK Proof Generation Security

| Item | Description |
|---|---|
| Proof Generation Loc. | Browser (Client-side) |
| .wasm/.zkey files | Fetch from `frontend/public/circuits/` |
| Proof Integrity | Groth16 verification performed on-chain; invalid proofs revert |
| Side-channel | Potential for timing attacks in browser environment, but practical risk is low |
| Proving Key Exposure | `.zkey` files are public, but this is normal in Groth16 design (safe to expose proving keys) |
