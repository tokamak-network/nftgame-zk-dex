# 1. 프로젝트 개요

[< 목차로 돌아가기](./README.md)

---

## 1.1 목적

ZK-SNARK를 활용하여 **NFT 소유권 프라이버시를 보장하면서도 온체인 검증이 가능한 게이밍 DEX**를 구축한다.

기존 NFT 전송의 문제점:
- 블록체인에서 NFT 전송 시 **소유자 지갑 주소, 거래 경로, 보유 자산**이 모두 공개됨
- 게임 아이템 거래 시 상대방의 보유 현황이 노출됨

이 프로젝트의 해결 방식:
- UTXO 스타일 "Note" 시스템으로 자산을 래핑
- ZK 증명으로 소유권을 증명하되, **구체적인 소유자/거래 경로는 비공개**
- Nullifier로 이중 사용(Double-Spend) 방지

## 1.2 타겟 사용자

| 사용자 유형 | 설명 |
|---|---|
| NFT 게이머 | 게임 내 아이템/카드를 프라이버시가 보장된 환경에서 거래하려는 사용자 |
| NFT 수집가 | 소유권을 비공개로 유지하면서 NFT를 전송하려는 사용자 |
| 게임 개발사 | ZK 기반 프라이버시 레이어를 게임에 통합하려는 팀 |
| 블록체인 연구자 | Groth16/Circom 기반 ZK 애플리케이션을 학습하려는 개발자 |

## 1.3 핵심 기능

| 기능 ID | 기능명 | 설명 | 상태 |
|---|---|---|---|
| F1 | Private NFT Transfer | UTXO 스타일 Note 시스템으로 NFT 소유권을 비공개 전송 | Done |
| F4 | Loot Box Open | Poseidon VRF 기반 검증 가능한 랜덤 루트박스 개봉 | Done |
| F5 | Gaming Item Trade | P2P 게임 아이템 거래 (에스크로 결제 + 게임 생태계 격리) | Done |
| F8 | Card Draw Verify | Fisher-Yates 셔플을 ZK 회로 내에서 검증하는 52장 카드 드로우 | Done |
| F9 | Card Draw Game | F8 기반 멀티플레이어 카드 게임 (Commit-Reveal 랜덤성) | Done |

### 기능별 핵심 포인트

**F1: Private NFT Transfer**
- UTXO 스타일 "Note" 시스템으로 NFT 전송
- Groth16 증명으로 온체인 즉시 검증
- Nullifier로 이중 사용 차단
- ECDH 암호화로 수신자만 Note 데이터 복호화

**F4: Loot Box Open**
- Poseidon VRF로 결정적이면서 예측 불가한 랜덤
- 희귀도 누적 임계값으로 드롭률 결정 (1% Legendary, 4% Epic, 15% Rare, 80% Common)
- Nullifier로 동일 박스 재개봉 차단

**F5: Gaming Item Trade**
- 7-input Poseidon 커미트먼트로 아이템 속성 보존
- 유료 거래 + 무료 선물 모두 지원
- `gameId` 바인딩으로 게임 간 아이템 이동 차단
- ERC20 에스크로 기반 안전한 결제

**F8: Card Draw Verify**
- 52장 전체 Fisher-Yates 셔플을 ZK 회로 내에서 검증 (~99K 제약조건)
- 덱은 Persistent (소비되지 않음) — 같은 덱에서 여러 장 드로우 가능
- drawIndex 매핑으로 같은 위치 중복 드로우 차단

**F9: Card Draw Game**
- F8 기반 멀티플레이어 (2~5명)
- Commit-Reveal + blockhash + prevrandao로 시드 조작 차단
- 가장 높은 카드 승리, 10% 수수료 차감 후 상금 지급

## 1.4 기술 스택 요약

| 레이어 | 기술 | 버전 |
|---|---|---|
| 스마트 컨트랙트 | Solidity + Hardhat + Foundry | 0.8.20 / 2.22.0 / latest |
| ZK 회로 | Circom + SnarkJS (Groth16) | 2.1.0 / 0.7.6 |
| 암호학 | Poseidon Hash + BabyJubJub + ECDH | circomlibjs 0.1.7 |
| 프론트엔드 | React + TypeScript + Vite + Tailwind | 19.2.0 / 5.9.3 / 7.3.1 / 4.1.18 |
| 블록체인 연결 | ethers.js + MetaMask | 6.16.0 |
| 테스트 | Mocha/Chai + Hardhat + Foundry/Forge | 170/170 통과 |
| 런타임 | Node.js | >=18 (권장 20) |

> 상세 버전 정보는 [02-시스템 아키텍처](./02-architecture.md) 참조
