# 9. Known Issues / 기술 부채

[< 목차로 돌아가기](./README.md)

---

## 9.1 Critical (프로덕션 전 반드시 해결)

| # | 이슈 | 위치 | 설명 |
|---|---|---|---|
| 1 | **Phase 2 Trusted Setup이 개발용** | `scripts/compile-circuit.js` | 단일 엔트로피 기여 → 증명 위조 가능. 다자간 세레모니 필수 |
| 2 | **접근 제어 누락 가능성** | `LootBoxOpen.sol` | `setBoxPrice()`, `withdrawTokens()`에 admin 체크 확인 필요 |
| 3 | **외부 감사 미수행** | 전체 컨트랙트 + 회로 | ZK 회로 + 스마트 컨트랙트 전문 감사 필요 |
| 4 | **ERC20 safeTransfer 미사용** | `LootBoxOpen.sol`, `GamingItemTrade.sol`, `CardDrawGame.sol` | 비표준 토큰에서 조용한 실패 가능 |

---

## 9.2 High (운영 리스크)

| # | 이슈 | 위치 | 설명 |
|---|---|---|---|
| 5 | **.env 설정 없음** | 프로젝트 전체 | 네트워크, API 키, 비밀 설정이 모두 하드코딩. 환경별 분리 필요 |
| 6 | **CI/CD 미구성** | 프로젝트 전체 | 자동 테스트/배포 파이프라인 없음 |
| 7 | **컨트랙트 업그레이드 불가** | 모든 컨트랙트 | 프록시 패턴 미사용. 버그 발견 시 재배포 + 마이그레이션 필요 |
| 8 | **Note 데이터 localStorage 평문 저장** | `frontend/src/lib/noteStore.ts` | XSS 공격 시 Note 해시 노출 |
| 9 | **blockhash 만료 미처리** | `CardDrawGame.sol` | 256블록 내 `finalizeReveal` 미호출 시 게임 교착. 복구 메커니즘 없음 |

---

## 9.3 Medium (기술 부채)

| # | 이슈 | 위치 | 설명 |
|---|---|---|---|
| 10 | **배포 주소 하드코딩** | `frontend/src/config/deployedAddresses.json` | 네트워크별 주소 관리 구조 없음 |
| 11 | **테스트넷/메인넷 미배포** | `hardhat.config.js` | localhost와 ganache만 설정됨 |
| 12 | **Docker 미지원** | 프로젝트 전체 | 컨테이너화 없음. 환경 재현성 낮음 |
| 13 | **미공개 플레이어 슬래싱 없음** | `CardDrawGame.sol` | 참가비만 몰수, 추가 패널티 없음. 의도적 미공개 전략 가능 |
| 14 | **회로 컴파일 시간** | `card_draw.circom` | ~99K 제약조건. 컴파일 5~10분, 증명 생성 수십 초 소요 |
| 15 | **프론트엔드 에러 핸들링** | 프론트엔드 전체 | ZK 증명 실패 시 사용자 안내 수준 확인 필요 |

---

## 9.4 Low (개선 사항)

| # | 이슈 | 위치 | 설명 |
|---|---|---|---|
| 16 | **admin 변경 불가** | 모든 admin 설정 컨트랙트 | 배포 시 msg.sender로 고정. 이관 함수 없음 |
| 17 | **이벤트 인덱싱 최적화** | 여러 컨트랙트 | 일부 이벤트에서 인덱스 파라미터 부족 |
| 18 | **가스 최적화** | 전체 컨트랙트 | Groth16 검증 가스 비용 높음 (~200K+ gas) |

---

## 9.5 "확인 필요" 목록

프로젝트 분석 중 정확한 확인이 필요한 항목들:

| 항목 | 확인 내용 | 확인 방법 |
|---|---|---|
| LootBoxOpen 접근 제어 | `setBoxPrice()`, `withdrawTokens()`에 `require(msg.sender == admin)` 존재 여부 | `contracts/LootBoxOpen.sol` 소스 확인 |
| F4 테스트 수 | README에는 39개, 분석에서는 48개로 집계 | 테스트 직접 실행 후 카운트 |
| 프론트엔드 에러 핸들링 | ZK 증명 실패 / TX 실패 시 사용자 안내 수준 | 프론트엔드 코드 및 실제 테스트 |
| 프로덕션 배포 대상 | 테스트넷/메인넷 계획 | 프로젝트 관리자에게 문의 |
