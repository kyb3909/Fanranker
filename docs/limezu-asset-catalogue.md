# LimeZu Modern Exteriors 에셋 카탈로그

영국 월드맵 (Phaser + Tiled, 16×16) 자동 생성용. 통짜 sheet ID 매칭 vs single PNG 직접 로드 의사결정을 위한 정리.

소스: `C:/Users/user/Downloads/Compressed/limezu/modernexteriors-win/Modern_Exteriors_16x16/ME_Theme_Sorter_16x16/`

---

## 24 테마 sheet 요약 (시각 확인 기반)

| # | 테마 | 카테고리 | 우리 사용 여부 |
|---|------|---------|--------------|
| 1 | Terrains_and_Fences | 잔디·물·흙·울타리·9-tile autotile (Grass_Water/Deep_Water/Grass_Fenced/Mound), Props 30종 | **HIGH** (지형 베이스) |
| 2 | City_Terrains | 아스팔트 도로 + 사이드워크 + 횡단보도 + 버스 정류장 + 라운드어바웃 큰 cluster | **HIGH** (도로) |
| 3 | City_Props | 가로등·벤치·쓰레기통·드론·전봇대·간판·꽃밭·분수 | **MID** (도시 decoration) |
| 4 | Generic_Buildings | Condo 6~9, Hardware_Store, Shop_Tent — modular 도시 빌딩 | **HIGH** (도시 cluster) |
| 5 | Floor_Modular_Buildings | 다층 모듈러 빌딩 부품 | LOW (수동 설계 필요) |
| 6 | Garage_Sales | 차고·세일 좌판 | NONE |
| 7 | Villas | 이층 주택 + 정원 + 작은 트리·꽃 props | **MID** (시골 마을) |
| 8 | Worksite | 공사장 차량·바리케이드·자재 | NONE |
| 9 | Shopping_Center_and_Markets | 대형 마트·매대 | LOW |
| 10 | Vehicles | 자동차·트럭·버스 | **MID** (도로 decoration) |
| 11 | Camping | **트리 348종** + Stump + Sprout + Mushroom + Moss + Rock + 캠핑 props | **HIGHEST** (숲 decoration) |
| 12 | Hotel_and_Hospital | 큰 hotel/hospital 단일 빌딩 | LOW |
| 13 | School | 학교 building + 운동장 | LOW |
| 14 | Swimming_Pool | 수영장 modular + 파라솔·튜브·**Palm_Tree** | LOW |
| 15 | Police_Station | 경찰서 building | NONE |
| 16 | Office | 오피스 빌딩 | LOW |
| 17 | Garden | 작은 꽃·풀·정원 props (Hedge, Bush, Flower) | **MID** (잔디 decoration) |
| 18 | Fire_Station | 소방서 | NONE |
| 19 | Graveyard | 묘비·고딕 fence·black tree | NONE (분위기 안 맞음) |
| 20 | Subway_and_Train_Station | 지하철·기차역 platform + 레일 | LOW |
| 21 | Beach | **Sand_Mountain (modular sand cliff)** + Lighthouse + Palm_Tree + Sea_Rock + Shell + Sprout | **HIGH** (해안선) |
| 22 | Post_Office | 우체국 | NONE |
| 23 | Military_Base | 군사기지 fence·텐트 | NONE |
| 24 | Additional_Houses | 큰 빅토리안 mansion (multi-floor modular) | **MID** (랜드마크) |

---

## 우리 use case 별 사용 후보

### 1. 강 (Grass_Water 9-tile autotile)
- **위치**: `1_Terrains_and_Fences_Singles_16x16/ME_Singles_Terrains_and_Fences_16x16_Grass_Water_<row>_<col>.png`
- **사이즈**: 16×16 single tile
- **Variation**: 4개 row × 22~23개 col = 88개 (`Grass_Water_1_1` ~ `Grass_Water_4_22`)
  - row 1~4 = 색상 변종 (서로 다른 잔디 색상에 매칭되는 강 edge)
  - col 1~9 = 9-tile autotile (NW/N/NE/W/center/E/SW/S/SE) + col 10~22 = 추가 변형 (강 끝, 굽이 등)
- **시각 확인**: 1_1=NW corner (잔디 안 물웅덩이), 1_5=center pure water, 1_9=SE corner — 9-tile pattern OK
- **권장**: **single PNG sprite 직접 로드** (sheet ID 매칭 alpha 변동으로 col 4~8 유실됨)

### 2. 깊은 바다 (Deep_Water 9-tile autotile)
- **위치**: `..._Deep_Water_1_<col>.png` (1~22)
- **사이즈**: 16×16 single
- **22개 single** (단일 row, 9-autotile + 추가 wave/대각 등)
- **권장**: single PNG. 이미 Phase 1 해안선에서 부분 매칭 확인됨 → 미스 발생 시 single 보완.

### 3. 잔디 (Grass)
- **위치**: `..._Grass_<row>_<col>.png`
- **87개 single tile** (5 row × ~17 col, 4가지 색상 변종 + 패턴)
- **현재 generate-uk-map.ts 사용 중**: `Grass_1_9` (plain green, gid 232) + `Grass_1_22` (변종, gid 405)
- **추가 후보**: `Grass_2_*` (조금 더 짙은 톤), `Grass_3_*` (흙 섞인 황녹색 — 영국 시골 fields 표현 좋음), `Grass_4_*`, `Grass_5_*`

### 4. 흙·황무지 (Mound + Props_Dirt)
- **위치**: `..._Mound_<row>_<col>.png` (9-tile dirt autotile) + `..._Props_Dirt_<n>.png` (1~30, scatter 흙 props)
- **사이즈**: Mound = 16×16, Props_Dirt = 16×16~32×32 mixed
- **권장**: Mound autotile은 single 로드. Props_Dirt 30종은 흩뿌리는 decoration.

### 5. 모래·해변 (Beach Sand_Mountain)
- **위치**: `21_Beach_Singles_16x16/`
- **Sand_Mountain_Big_/_Small_Left/Right_Side_Modular`** — 9-tile sand cliff modular
- **추가**: `Beach_16x16_Big_Sea_Rock_Vers_*`, `Small_Sea_Rock_*`, `Palm_Tree.png` (해안 단일 야자수, 32×32 추정)
- **권장**: 해안 픽업 시 single sprite. **Beach 폴더에는 모래 그 자체 base tile이 부재** — Sand_Mountain modular 가 모래 표현. 베이스로는 `Grass_3_*` (황색 잔디) 또는 `Mound`(흙) 대체 가능.

### 6. 산·돌·언덕 (CRITICAL: Mountain 부재)
- **결론**: Modern Exteriors 에 **rocky mountain autotile 없음**
- **대안 1**: `Camping/Rock_<n>.png` (single rock prop, 작은 돌멩이) 다수 흩뿌려 hill 시뮬
- **대안 2**: Beach `Big_Sea_Rock_Vers` / `Medium_Sea_Rock_<1~4>_Vers` (multi-tile rock cluster) — 실제로는 sea rock이라 색감 회청
- **대안 3**: `Mound` 9-tile (흙) + Props_Dirt + Tree 군집 = hill 분위기 fake
- **대안 4 (장기)**: 별도 LPC mountain autotile 또는 PixelLab 생성

### 7. 숲 (Tree variants — JACKPOT)
- **위치**: `11_Camping_Singles_16x16/ME_Singles_Camping_16x16_Tree_<n>.png`
- **개수**: **348종** (`Tree_1` ~ `Tree_348`)
- **사이즈**: 16×16 ~ 64×64 mix (대부분 32×32 multi-tile, 시각 확인 결과 1번은 ~24×24, 50번은 ~32×32)
- **권장**: **single PNG sprite 직접 로드** — sheet 통짜 매칭 비추 (multi-tile + alpha 그림자 fringe 때문에 미스률 높음). Sub-set (예: `Tree_1` ~ `Tree_30`) 만 사용해도 영국 숲 표현 충분.
- **부속**: `Tree_Dead_*` (5종), `Tree_Dead_Stick_*`, `Stump_<n>`, `Tree_Props_*` (가지·이파리)

### 8. 꽃·풀·관목 (Garden + Camping)
- **Sprout** (Camping, 4종) — 16×16 작은 풀잎
- **Mushrooms** (Camping, ~3종) — 16×16
- **Moss** (Camping, ~2종) — 16×16
- **Garden** 테마: Hedge, Flower_Bush, Flowers (City_Props 에도 있음, multi-tile)
- **권장**: Sprout/Moss/Mushroom 은 16×16 single 직접 로드. Hedge 는 9-tile autotile 가능성 — sheet 확인 필요.

### 9. 도시 cluster
- **Generic_Buildings** (테마 4): Condo_6~9 (modular 5~10층 빌딩), Hardware_Store, Shop_Tent
- **Villas** (테마 7): 2층 빨간/흰색 주택 + 정원 cluster (시골 마을)
- **Additional_Houses** (테마 24): 빅토리안 mansion — **EPL 경기장 entrance 랜드마크 후보**
- **사이즈**: 모두 multi-tile (3×4 ~ 8×12 cells)
- **권장**: sheet 매칭 시도하되 fallback 으로 single 로드. 빌딩별 "stamp" 함수로 group-place.

### 10. 도로 (Asphalt + Sidewalk)
- **위치**: `2_City_Terrains_Singles_16x16/`
- **Asphalt_1_Variation_<1~27>**: 27개 single (9-tile autotile + 횡단보도 + 차선 marker)
- **Sidewalk_<...>**: 324개 single (full 9-tile + corner + variant 다수 — 가장 풍부)
- **권장**: Asphalt 27개 single 로드 후 9-tile rule 로 자동 배치. **이게 LimeZu 에서 가장 정제된 autotile.**

---

## LimeZu 에 없는 것 (영국 월드맵에 부족한 항목)

| 항목 | 부재 여부 | 대안 |
|------|---------|------|
| Rocky Mountain autotile | **없음** | Mound + Tree 군집 + Camping/Rock 흩뿌리기, 또는 PixelLab 생성 |
| Hill (그라데이션 언덕) | 없음 | Grass 변종 색 차이로 시뮬, 또는 elevation 무시 (탑다운) |
| Castle / 왕궁 | 없음 | Additional_Houses 빅토리안 mansion 으로 대체, 또는 별도 에셋 |
| Stadium 큰 빌딩 | 없음 | Generic_Buildings Condo + custom Stadium sprite (자체 제작) |
| 도로 9-tile 완전체 (T-junction, 4-way) | Asphalt 27개에 일부 포함 — 실제 검증 필요 | sheet 시각 재확인. 부족 시 single 합성 |
| 영국적 cobblestone 길 | 없음 | Sidewalk 회색 → 적당 |
| 농경지 (밭 grid) | 없음 | Grass_3 + Mound 격자 패턴 simulate |
| 숲 ground (이끼·낙엽 밀집) | Camping Moss/Mushroom 부분 cover | Moss + Sprout + Tree 밀집 배치 |

---

## generate-uk-map.ts 즉시 사용 가능한 ID 목록

현재 sheet 통짜 (`modern-exteriors.png`) 에서 매칭 검증된 ID:

```ts
// 잔디 base
GRASS_PLAIN: 232,        // Grass_1_9 (plain green)
GRASS_VARIANT: 405,      // Grass_1_22 (변종)

// 깊은 바다 9-tile autotile (col 1~9 매핑, alpha encoding 따라 일부 fail 가능)
DEEP_WATER: {
  NW: 1363, N: 1364, NE: 1365,
  W:  1383, C: 1384, E:  1385,
  SW: 1403, S: 1404, SE: 1405,
}, // (대략 — 실측 필요)

// Grass_Water 9-tile (강) — 매칭 fragile, single 로드 권장
GRASS_WATER_PARTIAL: [/* 1_1, 1_2, 1_3, 1_9 만 OK */],
```

**single PNG 직접 로드 권장 (Phaser `this.load.image`)**:
- 해안선 fragile tile: `Grass_Water_1_4` ~ `Grass_Water_1_8` (sheet 매칭 fail)
- 트리 30종: `Camping/Tree_1.png` ~ `Tree_30.png` (multi-tile, sheet 매칭 비효율)
- 작은 decoration: `Sprout_1`, `Mushrooms_1`, `Moss_1`, `Rock_1` (Camping)
- 해안 모래 cliff: `Sand_Mountain_Small_Left/Right_Side_Modular_*` (Beach)

---

## 권장 다음 단계

1. **Phase 3 (산·숲)**: Mountain 포기 → Camping Tree 30종 + Mound + Rock single 로드해서 forest density 위주.
2. **Phase 4 (도시 cluster + 도로)**: Asphalt 27 single + Sidewalk 9-tile + Generic_Buildings/Villas multi-tile stamp.
3. **decoration ID matching** (#11): single PNG 로드 path 로 우회 — sheet alpha 디버깅 시간 비효율.
4. **카탈로그 활용**: 신규 sprite 필요 시 이 문서로 LimeZu 부재 여부 즉시 판단.
