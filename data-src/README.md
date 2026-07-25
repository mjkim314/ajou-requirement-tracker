# data-src — 졸업요건 데이터 소스 (편집하는 곳)

**여기가 사람이 편집하는 원본이다.** 앱이 읽는 `src/data/*.json` 은 이 폴더에서 **빌드로 생성**되며 손으로 고치지 않는다(R4 상속 모델).

```
data-src/  ──(scripts/build-data.ts)──▶  src/data/*.json  ──▶  앱·엔진
 (소스: 바뀐 것만)                         (완전본: 생성물)
```

## 왜 이렇게 하나

같은 학과의 인접 학번은 90% 넘게 겹친다(개선_방향_제안.md §2). 학번마다 24KB 완전본을 새로 쓰는 대신 **베이스 + 그 해 바뀐 것(패치)** 만 쓴다. 전역 정정(예: 평점표)은 베이스/조각 한 곳만 고치면 전 학번 산출물에 퍼진다.

## 명령

```
npm run data:build            # data-src → src/data 재생성(덮어쓰기)
npm run data:check            # 재생성 결과 = 커밋본 인지 바이트 대조 + 고아 소스/산출물 감지(CI 게이트)
npm run data:backport -- --force  # (1회성) 기존 src/data 에서 data-src 를 역생성 — 최초 생성/재현용
```

> **backport 재실행 주의**: `data:backport` 는 멱등이 아니다. `set-base.json` 을 커밋 산출물(=`$include` 가 이미 전개된 완전본)로 덮어써 **손으로 넣은 `$include`·조각 리팩터를 되돌린다.** 그래서 기존 `data-src/` 가 있으면 `--force` 없이는 멈춘다. 일상 편집에는 쓰지 말 것(`data:check` 의 미참조 조각 감지가 되돌림을 잡아주긴 한다).

`src/data/*.json` 을 손으로 고치면 `data:check`(와 `r4-build.test.ts`)가 실패한다. 소스를 고쳤으면 반드시 `data:build` 후 커밋.

## 레이아웃 (파일명 규약)

```
{slug}/meta.json                  { slug, college, department, years[], tracks[], trunk }
                                  또는 교양: { slug:"ge", years[], kind:"catalog-only" }
{slug}/set-base.json              트렁크 트랙 완전본(첫 학번). buckets 에 $include 허용
{slug}/set-{year}.patch.json      { trunk?: 패치(전년 트렁크 대비), tracks?: { <트랙>: 패치(같은 해 트렁크 대비) } }
{slug}/catalog-base.json          학과 카탈로그 완전본(첫 학번)
{slug}/catalog-{year}.patch.json  그 해 카탈로그 델타(courseKey 키) — 무변경 연도는 파일 생략 가능
{slug}/amr-base.json              추가전공 규칙 완전본(첫 학번)
{slug}/amr-{year}.patch.json      그 해 규칙 델타(id 키) — 무변경 연도는 파일 생략 가능
ge/catalog-{year}.json            다산 교양 카탈로그(완전본·연도별) — note 드리프트로 패치 무의미해 passthrough
ge/buckets-{year}.json            교양 공통 버킷 조각($include 대상, 산출물 아님)
```

- **trunk** = 그 학과의 기준 트랙(SW=advanced, ME=accredited). 다른 트랙은 같은 해 trunk 위에 얹는 패치로 표현한다(과정 간 델타가 학번마다 달라 트랙 패치도 학번별).
- 첫 학번(`years[0]`)의 `set-{year}.patch.json` 은 `trunk` 을 생략한다(베이스가 곧 트렁크). `tracks` 만 담는다.

## 패치 문법

패치는 평범한 JSON 객체다. base 대응 값의 형태에 따라 해석된다:

| base[k] | 패치 값 | 동작 |
|---|---|---|
| 스칼라/부재 | 무엇이든 | 대입(신규·교체) |
| 객체 | 객체 | 깊은 병합(재귀) |
| 배열(키 없음: codes 등) | 배열 | 통째 교체 |
| 배열(키 있음: id/courseKey) | 객체 | **키 병합**(아래) |
| 무엇이든 | `"$delete"` | 그 키 제거 |

**키 배열 병합** — 원소를 id 또는 courseKey 로 식별한다:

```jsonc
"buckets": {
  "major_elective": { "minCredits": 10 },        // 기존 원소 수정
  "new_bucket": { "id": "new_bucket", ... },      // base 에 없으면 새 원소(뒤에 추가)
  "$remove": ["old_bucket"],                       // 삭제
  "$order": ["a", "b", "c"]                         // 중간 삽입/재배열 시 결과 순서 강제
}
```

`$order` 는 자연 순서( (base 순서 − 삭제) ++ 추가분 )와 결과가 다를 때만 쓴다.

**$include** — 교양 공통 버킷 조각을 배열에 펼친다(위치 보존):

```jsonc
"buckets": [
  { "$include": "ge/buckets-2021" },   // → ajou_character, english, writing
  { "id": "area_liberal", ... },        // 학과 고유는 그대로
  ...
]
```

## 새 학번/학과 추가

- **다음 학번(예: 2027 SW)**: `meta.json` years 에 2027 추가 → `set-2027.patch.json`(트랙 패치 필수) 작성 + 카탈로그·규칙이 바뀌었으면 `catalog-2027.patch.json`·`amr-2027.patch.json` 에 **바뀐 것만**(무변경이면 파일 생략) → `npm run data:build`. 대개 id/name/version 갱신 + 델타 몇 줄이면 끝난다. 요람 대조는 `yoram-extract` 스킬.
- **새 학과**: `data-src/{slug}/` 에 `meta.json` + `set-base.json`(첫 학번, 교양 버킷은 `$include`) + `catalog-base.json` + `amr-base.json`. 교양 버킷 조각이 그 첫 학번에 없으면 `ge/buckets-{firstYear}.json` 을 함께 만든다.

## 불변식(테스트가 강제)

- `r4-build.test.ts`: 재생성 = 커밋본 바이트 동일.
- `r4-merge.test.ts`: 병합/역차분/직렬화/$include 의미론.
- 기존 `data-invariants`·`data-snapshot`·학번별 테스트: 산출물의 요건 무결성(변함없이 적용).
- diff 는 merge 의 정확한 역 → 역이식이 **산출물 값** 라운드트립을 구조적으로 보장(`scripts/backport.ts`). 단 이는 값 기준이며, `$include` 같은 수기 소스 형태는 backport 재실행 시 유실될 수 있다(`--force` 가드 + `data:check` 미참조 조각 감지로 방어).
