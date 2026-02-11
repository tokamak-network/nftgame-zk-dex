# 테스트 가이드

## 개요

이 프로젝트는 네 가지 수준의 테스트 시스템을 갖추고 있습니다:

| 수준 | 도구 | 블록체인 사용 | ZK 증명 사용 | 속도 |
|-------|------|------------|----------|-------|
| **회로 단위 테스트** | Mocha + snarkjs | 미사용 | 실제 증명 | 보통 (테스트당 약 2초) |
| **컨트랙트 단위(Hardhat)** | Hardhat + Chai | Hardhat EVM | Mock (항상 참) | 빠름 |
| **컨트랙트 단위(Foundry)** | Forge + forge-std | Forge EVM | Mock (항상 참) | 매우 빠름 |
| **통합 테스트** | Hardhat + snarkjs | Hardhat EVM | 실제 증명 | 느림 |

---

## 사전 준비 사항

테스트를 실행하기 전에 다음을 확인하세요:
1. **의존성 설치**: `npm install`
2. **Git 서브모듈 초기화**(Foundry용): `git submodule update --init --recursive`
3. **회로 컴파일**: `node scripts/compile-circuit.js`
4. **컨트랙트 컴파일**: `npx hardhat compile`

---

## 테스트 실행 방법

### 모든 테스트 일괄 실행

```bash
# 모든 Hardhat 테스트 (컨트랙트 및 통합)
npx hardhat test

# 모든 회로 단위 테스트
npx mocha test/circuits/ --timeout 120000

# 모든 Foundry 테스트
forge test

# 전체 통합 실행
npx hardhat test && npx mocha test/circuits/ --timeout 120000 && forge test
```

### 기능별 테스트

#### F1: 비공개 NFT 전송
- **회로 테스트**: `npx mocha test/circuits/nft-transfer.test.js --timeout 120000`
- **Hardhat 단위 테스트**: `npx hardhat test test/PrivateNFT.test.js`
- **Foundry 테스트**: `forge test --match-contract PrivateNFTTest`
- **통합 테스트**: `npx hardhat test test/PrivateNFT.integration.test.js`

#### F5: 게임 아이템 거래
- **회로 테스트**: `npx mocha test/circuits/gaming-item-trade.test.js --timeout 120000`
- **Hardhat 단위 테스트**: `npx hardhat test test/GamingItemTrade.test.js`
- **Foundry 테스트**: `forge test --match-contract GamingItemTradeTest`
- **통합 테스트**: `npx hardhat test test/GamingItemTrade.integration.test.js`

---

## Foundry 테스트 상세

Foundry (Forge) 테스트는 내장된 퍼즈(fuzz) 테스트 지원과 함께 빠르고 솔리디티 네이티브한 테스트를 제공합니다.

### 주요 기능 및 파라미터
- **속도**: 전체 실행에 약 100ms 내외 소요
- **퍼즈 테스트**: 자동으로 무작위 입력을 생성하여 검증 (기본 256회 반복)
- **가스 보고**: 테스트별 가스 사용량을 즉시 측정

### Foundry 실행 명령어
```bash
# 가스 보고서 포함 실행
forge test --gas-report

# 특정 컨트랙트만 실행
forge test --match-contract PrivateNFTTest

# 퍼즈 횟수 조정 (1024회)
forge test --fuzz-runs 1024
```

---

## 문제 해결 (Troubleshooting)

### "zkey not found"
회로 컴파일이 선행되지 않았을 때 발생합니다. `node scripts/compile-circuit.js` 명령어를 실행하세요.

### 테스트 타임아웃
실제 영지식 증명 생성은 성능에 따라 시간이 걸릴 수 있습니다. `--timeout` 값을 충분히 늘려주세요.

### "forge-std not found"
Foundry용 라이브러리가 설치되지 않은 경우입니다. `git submodule update --init --recursive`를 실행하세요.
