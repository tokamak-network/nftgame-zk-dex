# F5 게임 아이템 거래: 데모 → 실제 P2P 마켓플레이스

## 요약

### 1. contracts/GamingItemTrade.sol — 전면 재작성

- IERC20 paymentToken, admin, nextListingId, Listing 구조체, listings 매핑 추가
- 생성자가 이제 (address _tradeVerifier, address _paymentToken)을 받음
- registerItem()은 그대로 유지
- 기존 tradeItem() 제거 — 4개의 새로운 함수로 대체:
  - listItem() — 판매자가 유효한 note를 가격과 함께 등록
  - purchaseItem() — 구매자가 ERC20을 에스크로에 지불 + ZK 공개키 제출
  - executeTradeForBuyer() — 판매자가 ZK 증명 제출 → 기존 note 소비 → 구매자용 새 note 생성 → 판매자에게 에스크로 해제
  - cancelListing() — 판매자가 취소, 구매자가 지불했으면 자동 환불
- getListings() / getListing() 뷰 헬퍼 함수
- 4개의 새 이벤트: ItemListed, ItemPurchased, ItemTradeCompleted, ListingCancelled

### 2. scripts/deploy.js

- GamingItemTrade 항목에 args 추가: (verifierAddr) => [verifierAddr, tonAddr]

### 3. test/GamingItemTrade.test.js — 전면 재작성

- 총 27개 단위 테스트: registerItem (4개), listItem (5개), purchaseItem (6개), executeTradeForBuyer (7개), cancelListing (4개), getListings (1개)

### 4. test/GamingItemTrade.integration.test.js — 전면 재작성

- beforeEach 업데이트: MockERC20 배포 + 컨트랙트에 전달
- tradeItem() 호출을 전체 P2P 흐름(register → list → purchase → execute)으로 대체
- 테스트: 완전 유료 거래, 선물 거래, 연쇄 A→B→C 거래, 보안 거부, 이벤트

### 5. frontend/src/lib/noteUtils.ts — 2개 함수 추가

- setupF5SellerItem() — 판매자 키페어 생성 + oldItemHash 계산
- setupF5TradeWithBuyer() — 온체인 구매자 ZK 공개키를 받아서 newItemHash + 증명 생성용 회로 입력 계산

### 6. frontend/src/pages/F5GamingItemTradePage.tsx — 전면 재작성

- 역할 선택 화면 (판매자 / 구매자)
- 판매자: 6단계 흐름 (구성 → 등록 → 등록 → 구매자 대기 폴링 → 증명 생성 → 거래 실행)
- 구매자: 활성 리스팅 테이블 폴링 (5초), 선택 시 로컬 ZK 키페어 자동 생성, 승인+구매 원클릭, 그 후 판매자의 ZK 증명 대기