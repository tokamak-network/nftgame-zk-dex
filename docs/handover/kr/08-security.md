# 8. 보안 고려사항

[< 목차로 돌아가기](./README.md)

---

## 8.1 암호학적 보안

| 항목 | 구현 방식 | 평가 |
|---|---|---|
| ZK 증명 시스템 | Groth16 (SnarkJS) | 성숙한 구현, 프로덕션 사용 가능 |
| 해시 함수 | Poseidon | ZK 친화적, 안전성 검증됨 |
| 타원곡선 | BabyJubJub | ZK 회로 내 효율적 연산 |
| 키 관리 | BabyJubJub EdDSA (sk → pk) | 표준 구현 |
| 암호화 | ECDH (Note 데이터) | 수신자만 복호화 가능 |
| Double-Spend | Nullifier 매핑 (온체인) | 안전 |
| VRF | Poseidon(sk, seed) | 결정적, 검증 가능 |

---

## 8.2 Trusted Setup (신뢰 설정) -- 중요

| 항목 | 현재 상태 | 리스크 |
|---|---|---|
| Phase 1 | Hermez PTAU (공개 세레모니) | **안전** |
| Phase 2 | **개발용 단일 기여** | **프로덕션 사용 불가** |

### Phase 2 문제점

현재 `scripts/compile-circuit.js`에서 Phase 2 기여가 다음과 같이 실행된다:

```
snarkjs zkey contribute {zkey_0} {zkey} --name="Dev Contribution" -e="random entropy for dev"
```

**리스크:** 단일 기여자의 엔트로피만 사용한다. 이 기여자가 엔트로피를 저장했다면 **유효한 증명을 위조**할 수 있다.

**필수 조치 (프로덕션 전):**
- 다자간 Phase 2 세레모니 진행 (최소 3명 이상)
- 각 기여자는 독립적으로 엔트로피 생성
- 기여 증거(contribution transcript) 공개 검증

---

## 8.3 스마트 컨트랙트 보안

| 항목 | 상태 | 설명 |
|---|---|---|
| Reentrancy Guard | 미적용 | 외부 호출 후 상태 변경 패턴 없어 직접적 리스크 낮음 |
| Access Control | **부분 미흡** | `LootBoxOpen.setBoxPrice()`, `withdrawTokens()`에 `msg.sender == admin` 체크 필요 (**확인 필요**) |
| ERC20 전송 | `transfer`/`transferFrom` | `safeTransferFrom` 미사용 — 비표준 토큰에서 실패 가능 |
| Integer Overflow | Solidity 0.8.20 내장 | 안전 |
| 프록시 패턴 | 미사용 | 업그레이드 불가 (버그 발견 시 재배포 필요) |
| 외부 감사 | **미수행** | 프로덕션 전 필수 |

### 접근 제어 상세

| 컨트랙트 | 함수 | 접근 제어 | 상태 |
|---|---|---|---|
| LootBoxOpen | `setBoxPrice()` | admin 체크 필요 | **확인 필요** |
| LootBoxOpen | `withdrawTokens()` | admin 체크 필요 | **확인 필요** |
| CardDrawGame | `withdrawFees()` | admin 체크 | 구현됨 |
| 전체 | admin 변경 | 없음 | 배포 시 msg.sender로 고정, 이관 불가 |

---

## 8.4 프론트엔드 보안

| 항목 | 상태 | 설명 |
|---|---|---|
| BabyJubJub 키 저장 | 브라우저 메모리 (비영구) | 새로고침 시 재생성 필요 |
| Note 저장 | localStorage **평문** | XSS 공격 시 Note 해시 노출 가능 |
| CORS 설정 | `same-origin` + `require-corp` | SharedArrayBuffer용 (snarkjs 멀티스레드) |
| 입력 검증 | 기본적 수준 | ZK 회로가 최종 검증 담당 |

### XSS 공격 시 영향

localStorage에 저장된 Note 해시가 노출되면:
- Note의 존재 여부는 이미 온체인에서 공개 (NoteCreated 이벤트)
- **비밀키(sk)는 localStorage에 저장되지 않으므로** 공격자가 Note를 사용할 수는 없음
- 다만 사용자의 자산 보유 현황이 노출될 수 있음

---

## 8.5 블록체인 랜덤성 (F9 Card Game)

### Commit-Reveal 메커니즘

| 단계 | 공격 시도 | 방어 |
|---|---|---|
| Phase 1 (커밋) | drawIndex를 미리 계산해서 유리한 덱 제출 | drawIndex는 커밋 이후에 결정됨 |
| Phase 1.5 (PendingReveal) | blockhash를 예측 | revealBlock = block.number + 2 (아직 미채굴) |
| Phase 2 (Revealing) | Validator가 블록 조작 | `prevrandao` + `blockhash` 이중 랜덤 |

### 잔여 리스크

| 리스크 | 심각도 | 설명 |
|---|---|---|
| Validator 공모 | 낮음 | prevrandao와 blockhash 동시 조작에는 블록 포기 비용 발생 |
| blockhash 만료 | 중간 | 256블록(~51분) 내 `finalizeReveal` 미호출 시 게임 교착 |
| 게임 교착 복구 | **없음** | blockhash 만료 후 복구 메커니즘 미구현 |

---

## 8.6 ZK 증명 생성 보안

| 항목 | 설명 |
|---|---|
| 증명 생성 위치 | 브라우저 (클라이언트 사이드) |
| .wasm/.zkey 파일 | `frontend/public/circuits/`에서 fetch |
| 증명 무결성 | Groth16 검증이 온체인에서 수행되므로 잘못된 증명은 revert |
| 사이드채널 | 브라우저 환경에서 타이밍 공격 가능성 있으나 실질적 리스크 낮음 |
| 프루빙 키 노출 | `.zkey` 파일이 public에 있으나, 이는 Groth16 설계상 정상 (프루빙 키는 공개해도 안전) |
