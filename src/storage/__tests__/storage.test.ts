import { describe, expect, it, afterEach } from 'vitest'
import type { Course, Profile, RequirementSet } from '../../engine/index'
import {
  APP_ID,
  SCHEMA_VERSION,
  defaultSettings,
  emptyPersistedState,
  validatePersonalBackup,
  validateReqsetShare,
  type PersistedState,
} from '../schema'
import {
  createAdapter,
  createMemoryStore,
  detectStorage,
  type KeyValueStore,
} from '../adapter'
import {
  backupFilename,
  backupToState,
  buildPersonalBackup,
  buildReqsetShare,
  parsePersonalBackup,
  parseReqsetShare,
  serialize,
} from '../backup'

// ── 표본 데이터 ──
const profile: Profile = {
  schemaVersion: 2,
  admissionYear: 2021,
  college: '소프트웨어융합대학',
  department: '소프트웨어학과',
  trackType: 'advanced',
  requirementSetId: 'rs_2021_sw_advanced',
  additionalMajors: [],
  exemptions: [],
  currentSemester: '2022-2',
  targetGraduation: '2025-2',
  onboardingCompleted: true,
}

const courses: Course[] = [
  { id: 'c1', semester: '2021-1', courseKey: 'SW-PROGRAMMING', nameSnapshot: 'SW-PROGRAMMING', credits: 4, state: 'completed', grade: 'A+' },
  { id: 'c2', semester: '2021-2', courseKey: 'SW-DATA-STRUCT', nameSnapshot: 'SW-DATA-STRUCT', credits: 3, state: 'completed', grade: 'B+' },
]

const customSet: RequirementSet = {
  schemaVersion: 1,
  requirementVersion: 'x',
  id: 'rs_custom_1',
  name: '내 커스텀 세트',
  trackType: 'advanced',
  totalCredits: 130,
  minGPA: 2.0,
  buckets: [],
  nonCurricular: [],
  author: '홍길동(개인식별)',
  source: { note: 'SECRET_SOURCE_MARKER' },
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2020-02-02T00:00:00.000Z',
}

function sampleState(): PersistedState {
  return {
    profile,
    courses,
    noncurricular: { english_cert: { alternatives: { opic: { level: 'IL' } } } },
    customSets: [customSet],
    settings: {
      lastBackupAt: '2026-07-22T00:00:00.000Z',
      bannerDismissedAt: null,
      courseCountAtLastBackup: 2,
      semesterNudgeShownFor: null,
    },
  }
}

const EXPORTED_AT = '2026-07-22T12:00:00.000Z'

// ────────────────────────────────────────────────────────────
describe('adapter — 저장/로드 왕복', () => {
  it('saveAll → loadAll이 원상복구된다', () => {
    const a = createAdapter(createMemoryStore())
    const state = sampleState()
    expect(a.saveAll(state)).toBe(true)
    expect(a.loadAll()).toEqual(state)
  })

  it('빈 저장소는 기본 상태를 준다', () => {
    const a = createAdapter(createMemoryStore())
    expect(a.loadAll()).toEqual(emptyPersistedState())
  })

  it('덩어리에 v와 updatedAt 봉투가 붙는다', () => {
    const kv = createMemoryStore()
    const a = createAdapter(kv)
    a.saveChunk('courses', courses)
    const raw = kv.getItem('ajou-grad:courses')!
    const env = JSON.parse(raw)
    expect(env.v).toBe(SCHEMA_VERSION)
    expect(typeof env.updatedAt).toBe('string')
    expect(env.value).toEqual(courses)
  })

  it('손상된 값은 없는 것으로 취급한다', () => {
    const kv = createMemoryStore()
    kv.setItem('ajou-grad:courses', '{ not json')
    const a = createAdapter(kv)
    expect(a.loadAll().courses).toEqual([])
  })

  it('버전이 앱보다 높은 봉투는 무시한다', () => {
    const kv = createMemoryStore()
    kv.setItem('ajou-grad:profile', JSON.stringify({ v: SCHEMA_VERSION + 1, updatedAt: 'x', value: profile }))
    const a = createAdapter(kv)
    expect(a.loadAll().profile).toBeNull()
  })

  it('clearAll이 모든 키를 지운다', () => {
    const a = createAdapter(createMemoryStore())
    a.saveAll(sampleState())
    a.clearAll()
    expect(a.loadAll()).toEqual(emptyPersistedState())
  })

  it('setItem 실패 시 saveChunk가 false를 반환한다(예외 없음)', () => {
    const failing: KeyValueStore = { getItem: () => null, setItem: () => false, removeItem: () => {} }
    const a = createAdapter(failing, true)
    expect(a.saveChunk('courses', courses)).toBe(false)
    expect(a.saveAll(sampleState())).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────
describe('detectStorage — 가용성 감지', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else delete (globalThis as Record<string, unknown>).localStorage
  })

  function stubLocalStorage(impl: Partial<Storage>) {
    Object.defineProperty(globalThis, 'localStorage', { value: impl, configurable: true, writable: true })
  }

  it('쓰기 가능한 localStorage면 persistent=true', () => {
    const map = new Map<string, string>()
    stubLocalStorage({
      getItem: (k) => (map.has(k) ? map.get(k)! : null),
      setItem: (k, v) => void map.set(k, String(v)),
      removeItem: (k) => void map.delete(k),
    })
    const a = detectStorage()
    expect(a.persistent).toBe(true)
    a.saveChunk('settings', defaultSettings())
    expect(a.loadAll().settings.lastBackupAt).toBeNull()
  })

  it('setItem이 던지면(시크릿 모드) 메모리로 폴백하고 persistent=false + 경고', () => {
    stubLocalStorage({
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError')
      },
      removeItem: () => {},
    })
    const a = detectStorage()
    expect(a.persistent).toBe(false)
    expect(a.reason).toBeTruthy()
    // 폴백이어도 세션 내 동작은 유지
    expect(a.saveChunk('settings', defaultSettings())).toBe(true)
  })

  it('localStorage 자체가 없으면 메모리 폴백', () => {
    delete (globalThis as Record<string, unknown>).localStorage
    const a = detectStorage()
    expect(a.persistent).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────
describe('backup — 개인 백업 왕복', () => {
  it('build → serialize → parse → backupToState가 원본과 같다', () => {
    const state = sampleState()
    const file = buildPersonalBackup(state, EXPORTED_AT)
    const text = serialize(file)
    const parsed = parsePersonalBackup(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(backupToState(parsed.value.backup)).toEqual(state)
    expect(parsed.value.preview).toMatchObject({
      admissionYear: 2021,
      department: '소프트웨어학과',
      trackType: 'advanced',
      courseCount: 2,
      customSetCount: 1,
    })
  })

  it('완료 기준: 내보내고 → 저장소 비우고 → 불러오면 복원된다', () => {
    const kv = createMemoryStore()
    const a = createAdapter(kv)
    const state = sampleState()
    a.saveAll(state)

    const text = serialize(buildPersonalBackup(a.loadAll(), EXPORTED_AT))
    a.clearAll()
    expect(a.loadAll()).toEqual(emptyPersistedState())

    const parsed = parsePersonalBackup(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    a.saveAll(backupToState(parsed.value.backup))
    expect(a.loadAll()).toEqual(state)
  })

  it('파일명 규칙', () => {
    const d = new Date('2026-07-09T00:00:00.000Z')
    expect(backupFilename('ajou-grad-backup', 2021, d)).toBe('ajou-grad-2021-20260709.json')
    expect(backupFilename('ajou-grad-reqset', 2021, d)).toBe('ajou-grad-reqset-20260709.json')
    expect(backupFilename('ajou-grad-backup', null, d)).toBe('ajou-grad-backup-20260709.json')
  })
})

// ────────────────────────────────────────────────────────────
describe('reqset share — 개인 데이터 미포함', () => {
  it('공유 파일은 세트 정의만 담고 author·source·타임스탬프 등 개인 흔적을 화이트리스트로 제거한다', () => {
    const share = buildReqsetShare([customSet], EXPORTED_AT)
    const text = serialize(share)
    // 개인 데이터·식별 문자열이 직렬화 결과에 없어야 한다
    expect(text).not.toContain('개인식별')
    expect(text).not.toContain('SECRET_SOURCE_MARKER')
    expect(text).not.toContain('2020-01-01')
    expect(text).not.toContain('SW-PROGRAMMING')
    const parsed = parseReqsetShare(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const s = parsed.value.share.requirementSets[0]!
    expect(s.author).toBeUndefined()
    expect(s.source).toBeUndefined()
    expect(s.createdAt).toBeUndefined()
    expect(s.updatedAt).toBeUndefined()
    expect(parsed.value.preview.sets).toEqual([{ id: 'rs_custom_1', name: '내 커스텀 세트' }])
  })
})

// ────────────────────────────────────────────────────────────
describe('검증 거부 규칙', () => {
  it('개인 백업 불러오기에 공유 파일이 오면 거부', () => {
    const share = serialize(buildReqsetShare([customSet], EXPORTED_AT))
    const r = parsePersonalBackup(share)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe('wrong_type')
  })

  it('공유 불러오기에 개인 백업이 오면 거부', () => {
    const backup = serialize(buildPersonalBackup(sampleState(), EXPORTED_AT))
    const r = parseReqsetShare(backup)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe('wrong_type')
  })

  it('스키마 버전이 앱보다 높으면 거부', () => {
    const future = { ...buildPersonalBackup(sampleState(), EXPORTED_AT), schemaVersion: SCHEMA_VERSION + 1 }
    const r = validatePersonalBackup(future)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe('version_too_high')
  })

  it('다른 앱/JSON 아님/형식 오류 거부', () => {
    expect(validatePersonalBackup({ app: 'other', type: 'ajou-grad-backup', schemaVersion: 1 }).ok).toBe(false)
    const notJson = parsePersonalBackup('{ broken')
    expect(notJson.ok).toBe(false)
    if (notJson.ok) return
    expect(notJson.code).toBe('not_json')
    expect(validateReqsetShare({ app: APP_ID, type: 'ajou-grad-reqset', schemaVersion: 1, requirementSets: [] }).ok).toBe(false)
  })

  it('엔진 필수 필드가 빠진 요건 세트는 거부(evaluate 크래시 방지)', () => {
    const badSet = { id: 'x', name: 'y' } // buckets·nonCurricular·totalCredits·minGPA·trackType 없음
    const share = {
      app: APP_ID,
      type: 'ajou-grad-reqset',
      schemaVersion: 1,
      exportedAt: EXPORTED_AT,
      requirementSets: [badSet],
    }
    const r1 = validateReqsetShare(share)
    expect(r1.ok).toBe(false)

    const backup = {
      app: APP_ID,
      type: 'ajou-grad-backup',
      schemaVersion: 1,
      exportedAt: EXPORTED_AT,
      profile: null,
      courses: [],
      noncurricular: {},
      customSets: [badSet],
      settings: { lastBackupAt: null },
    }
    const r2 = validatePersonalBackup(backup)
    expect(r2.ok).toBe(false)
    if (r2.ok) return
    expect(r2.code).toBe('bad_shape')
  })
})
