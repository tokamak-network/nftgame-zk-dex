# NFT Gaming ZK-DEX 인수인계 문서

> 작성일: 2026-03-03
> 대상: 신규 합류 개발자
> 예상 온보딩 기간: 3~7일

---

## 문서 구조

| # | 문서 | 설명 | 읽기 순서 |
|---|---|---|---|
| 1 | [프로젝트 개요](./01-project-overview.md) | 목적, 타겟 사용자, 핵심 기능, 기술 스택 | Day 1 |
| 2 | [시스템 아키텍처](./02-architecture.md) | 3-레이어 구조도, 외부 의존성 | Day 1 |
| 3 | [디렉토리 구조](./03-directory-structure.md) | 폴더 트리, 핵심 파일 빠른 참조 | Day 1 |
| 4 | [핵심 비즈니스 로직](./04-business-logic.md) | UTXO Note 시스템, F1/F4/F5/F8/F9 데이터 흐름 | Day 2~3 |
| 5 | [데이터 구조](./05-data-structures.md) | 온체인 상태, Note 해시, localStorage, 캐싱 | Day 3~4 |
| 6 | [API 명세](./06-api-reference.md) | 컨트랙트 함수, 이벤트 전체 목록 | Day 3~4 (참조용) |
| 7 | [배포 및 운영](./07-deployment-ops.md) | 환경 설정, 실행, 테스트, CI/CD | Day 1~2 |
| 8 | [보안 고려사항](./08-security.md) | 암호학, Trusted Setup, 컨트랙트, 프론트엔드 보안 | Day 5 |
| 9 | [Known Issues / 기술 부채](./09-known-issues.md) | Critical~Low 등급별 이슈 목록 | Day 5~6 |
| 10 | [향후 개선 + 온보딩 가이드](./10-improvements-onboarding.md) | 단기/중기/장기 로드맵, 7일 체크리스트 | Day 1 + Day 7 |

---

## 추천 읽기 순서

### 첫날 (빠른 파악)
1. **이 문서** (README) - 전체 구조 파악
2. [01-프로젝트 개요](./01-project-overview.md) - "이 프로젝트가 뭔지"
3. [07-배포 및 운영](./07-deployment-ops.md) - 로컬에서 일단 돌려보기
4. [10-온보딩 가이드](./10-improvements-onboarding.md) - Day별 체크리스트 확인

### 둘째~셋째 날 (깊은 이해)
5. [02-시스템 아키텍처](./02-architecture.md) - 전체 구조와 레이어
6. [03-디렉토리 구조](./03-directory-structure.md) - 어떤 파일이 어디 있는지
7. [04-핵심 비즈니스 로직](./04-business-logic.md) - 가장 중요한 문서

### 넷째~다섯째 날 (심화)
8. [05-데이터 구조](./05-data-structures.md) - 온체인/오프체인 상태
9. [06-API 명세](./06-api-reference.md) - 필요할 때 참조
10. [08-보안 고려사항](./08-security.md) - 무엇이 안전하고 무엇이 위험한지

### 여섯째~일곱째 날 (실전 투입)
11. [09-Known Issues](./09-known-issues.md) - 반드시 알아야 할 리스크
12. [10-향후 개선](./10-improvements-onboarding.md) - 다음에 해야 할 일

---

## 관련 기존 문서

| 문서 | 경로 | 설명 |
|---|---|---|
| README | `../../README.md` | 프로젝트 메인 문서 (영문) |
| Setup Guide | `../setup.md` | 환경 설치 상세 가이드 |
| Testing Guide | `../testing.md` | 테스트 실행 가이드 |
| Circuit Architecture | `../circuits.md` | ZK 회로 설계 상세 |
| Contract Architecture | `../contracts.md` | 스마트 컨트랙트 설계 상세 |
