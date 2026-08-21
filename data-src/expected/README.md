# expected/ — 요람 기대값 명세 (R5)

요람 인쇄면에서 직접 읽은 소계를 JSON으로 기록한 파일입니다.
범용 비교기 테스트(`src/engine/__tests__/data-expected.test.ts`)가
생성된 세트·카탈로그를 이 명세와 자동 대조합니다.

## 파일 명명

```
{학번}-{slug}.json
```

예: `2021-sw.json`, `2022-me.json`

## 필드 설명

| 필드 | 타입 | 설명 |
|---|---|---|
| `description` | string | 사람용 설명 (테스트에서 사용하지 않음) |
| `totalCredits` | number | 졸업 총학점 (전 트랙 동일) |
| `minGPA` | number | 최저 평점 (전 트랙 동일) |
| `buckets` | `Record<id, minCredits>` | 트렁크 트랙의 버킷별 최소학점 |
| `trackOverrides` | `Record<track, Record<id, minCredits>>` | 트렁크가 아닌 트랙에서 **달라지는** 버킷만 |
| `majorRequiredCount` | number | `major_required` 버킷의 requiredCourses 개수 |
| `catalogCount` | number | 학과 카탈로그 과목 수 (GE 제외) |
| `choiceGroupCount` | number | 트렁크의 총 택1 그룹 수 |
| `nonCurricularCount` | number | 트렁크의 비교과 항목 수 |
| `creditBreakdown` | `Record<string, number>` | **(optional)** 이론/설계/실습 소계 — 정확도 보장 학번만 |

## 신규 학과·학번 추가 시

1. `data-src/{slug}/` 에 패치 파일 작성
2. `npm run data:build` 로 산출물 생성
3. 요람을 보고 `data-src/expected/{학번}-{slug}.json` 작성
4. `npm test` → 기대값 비교기가 자동 검증

기대값 파일이 없는 번들은 비교기가 **건너뜀(skip)** — 에러가 아닙니다.
점진적으로 기대값을 추가하면 됩니다.

## 값 추출 보조 스크립트

기존 세트에서 기대값을 자동 추출하려면:

```bash
node scripts/extract-expected.mjs   # (별도 제공 시)
```

단, 요람 대조 없이 세트에서 뽑은 값은 **세트가 이미 맞다는 전제**입니다.
신규 건은 반드시 요람 인쇄면과 교차 대조하세요.
