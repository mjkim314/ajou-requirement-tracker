# expected/ — 요람 기대값 명세 (R5)

**요람 인쇄면에서 직접 읽은 값**을 JSON으로 기록한 파일입니다.
범용 비교기 테스트(`src/engine/__tests__/data-expected.test.ts`)가
생성된 세트·카탈로그를 이 명세와 자동 대조합니다.

## 이 폴더가 지키려는 것 — 순환검증 금지

기대값을 **산출물(`src/data/*.json`)에서 뽑으면 이 폴더는 아무것도 검증하지 않습니다.**
"산출물과 산출물이 같다"만 확인하게 되고, 요건 숫자가 틀려도 테스트는 전부 초록입니다.
R5 초판이 실제로 그 상태였습니다(2026-08-21 발견·교체).

그래서 두 가지를 강제합니다.

1. **`source.method`를 반드시 선언한다.** 파일이 자기 출처를 밝히지 않으면 테스트가 실패합니다.

   | 값 | 뜻 |
   |---|---|
   | `blind-yoram` | 요람 PDF를 직접 판독. **산출물·기존 기대값을 보지 않고** 작성 |
   | `derived-from-output` | 산출물에서 역산. **정확성의 근거가 아님** — 회귀 방지용 |

2. **`blind-yoram` 명세는 `printedSubtotals`를 함께 싣는다.** 요람은 개별 칸 학점과 **별도로**
   그룹 소계를 인쇄합니다(`(소계 : 20)`). 개별 학점의 합이 이 소계와 맞는지 검사하면,
   산출물에서 역산한 값으로는 통과할 수 없는 산술 구속이 생깁니다.

   ```
   요람:  아주인성 1 │ 영어 6 │ 글쓰기 3 │ 영역별교양 9     (소계 : 19)
                      └──────── 우리 버킷 합 ────────┘  =  독립 인쇄값
   ```

   **한계**: 소계는 그룹 **합**을 구속하지, 그룹 **안의 배분**까지 잡지 못합니다.
   (수학 12 + 기초과학 7 을 11 + 8 로 잘못 나눠도 소계 20은 그대로 맞습니다.)
   개별 칸이 요람에 인쇄돼 있다면 그대로 옮겨 적는 것이 여전히 1차 방어선입니다.

## 판독 절차 (신규 학번·학과)

```bash
pdftotext -layout "Docs/요람/<대학>/<파일>.pdf" /tmp/yoram.txt
grep -n "졸업 이수학점" /tmp/yoram.txt      # 「1. 졸업 이수학점 및 구성 현황」 절
```

1. **구성현황표**를 읽는다. `-layout` 추출이라 열이 공백 정렬돼 있으니 **머리글 행과 숫자 행의
   컬럼 좌표를 세어** 어느 숫자가 어느 열인지 확정한다. 순서만 맞추면 병합셀에서 틀린다.
2. 괄호 안 **소계**를 원문 그대로 기록한다(`raw`). 개별값 합과 맞는지 **직접 더해서** 확인한다.
3. 과정(심화/일반/복수/부전공)별 행을 각각 본다. 트렁크와 달라지는 값만 `trackOverrides`에.
4. 「2. 졸업요건」에서 총학점·평점·전공 인필과목 목록을 읽는다.
5. **인쇄 안 된 값은 적지 않는다.** 유도할 수 있는 것만 `residualBucket`으로 표현한다.

> **작성자가 사람이든 에이전트든, 판독 중에는 `src/data/`·기존 `expected/`를 열지 않습니다.**
> 한 번 보면 그 값에 끌려가 검증이 무의미해집니다.

## 파일 명명

```
{학번}-{slug}.json      예: 2021-sw.json, 2022-me.json
```

## 필드

### 요람에서 읽은 값

| 필드 | 타입 | 설명 |
|---|---|---|
| `source` | object | `document`·`section`·`method`·`verifiedOn`·`note` |
| `totalCredits` | number | 졸업 총학점 (전 트랙 동일) |
| `minGPA` | number | 최저 평점 (전 트랙 동일) |
| `buckets` | `Record<id, minCredits>` | 트렁크 트랙의 버킷별 최소학점 |
| `printedSubtotals` | array | `{label, credits, raw, buckets[]}` — 요람 인쇄 소계와 그에 묶이는 버킷 |
| `residualBucket` | string | 총학점 − 소계 합 이 들어가는 버킷 (보통 `general_elective`) |
| `trackOverrides` | `Record<track, Record<id, minCredits>>` | 트렁크와 **달라지는** 버킷만 |
| `trackSubtotals` | `Record<track, Record<label, {credits, buckets[]}>>` | 트랙별로 달라지는 소계 |
| `majorRequiredCount` | number | `major_required`의 requiredCourses 개수 |
| `majorRequiredCourses` | string[] | 요람이 나열한 전공필수 **과목명** — 개수만 맞고 과목이 다른 경우를 잡는다 |
| `notes` | string[] | 판독 단서·유보 사항 |

### 요람에서 읽지 않은 값

| 필드 | 설명 |
|---|---|
| `regressionOnly` | `catalogCount`·`choiceGroupCount`·`nonCurricularCount`. **요람 인쇄값이 아니라 산출물 스냅샷**이다. 구조가 조용히 바뀌는 것만 막고, 정확성은 보증하지 않는다. 이 구분을 흐리지 말 것 |

## 신규 학과·학번 추가 시

1. `data-src/{slug}/` 에 패치 파일 작성
2. `npm run data:build` 로 산출물 생성
3. **요람을 판독해** `data-src/expected/{학번}-{slug}.json` 작성 (위 절차)
4. `npm test` → 비교기가 자동 검증

기대값 파일이 없는 번들은 비교기가 **건너뜁니다(skip)** — 에러가 아닙니다.
점진적으로 추가하면 됩니다.

## 현재 상태

| 번들 | method |
|---|---|
| 2021~2026 sw | `blind-yoram` — 학번별 단독 요람 PDF 판독 (2026-08-21) |
| 2021·2022 me | `derived-from-output` — **요람 대조 전** |
