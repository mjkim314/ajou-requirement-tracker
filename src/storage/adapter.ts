/**
 * Storage Adapter — localStorage 접근은 오직 여기서만 한다(CLAUDE.md 규칙 2).
 * 나중에 계정/서버를 붙이면 이 계층만 교체한다.
 *
 * - 저장 실패(용량 초과·시크릿 모드)는 예외를 던지지 않고 false로 알린다.
 * - localStorage를 못 쓰면 메모리 어댑터로 폴백해 앱이 죽지 않게 하고, persistent=false로 경고를 알린다.
 */

import type { Course, NonCurricularState, Profile, RequirementSet } from '../engine/index'
import {
  STORAGE_NS,
  STORAGE_KEYS,
  SCHEMA_VERSION,
  defaultSettings,
  emptyPersistedState,
  migrateEnvelope,
  type Envelope,
  type PersistedState,
  type Settings,
  type StorageKey,
} from './schema'

/** 논리 키 → 실제 저장 키(네임스페이스 접두). */
function physicalKey(key: StorageKey): string {
  return `${STORAGE_NS}:${key}`
}

// ────────────────────────────────────────────────────────────
// 저수준 키-값 어댑터
// ────────────────────────────────────────────────────────────

export interface KeyValueStore {
  getItem(key: string): string | null
  /** 실패 시 false(예외 없음). */
  setItem(key: string, value: string): boolean
  removeItem(key: string): void
}

class LocalStorageStore implements KeyValueStore {
  constructor(private readonly ls: Storage) {}
  getItem(key: string): string | null {
    try {
      return this.ls.getItem(key)
    } catch {
      return null
    }
  }
  setItem(key: string, value: string): boolean {
    try {
      this.ls.setItem(key, value)
      return true
    } catch {
      return false
    }
  }
  removeItem(key: string): void {
    try {
      this.ls.removeItem(key)
    } catch {
      /* noop */
    }
  }
}

class MemoryStore implements KeyValueStore {
  private readonly map = new Map<string, string>()
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null
  }
  setItem(key: string, value: string): boolean {
    this.map.set(key, value)
    return true
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
}

/** localStorage 쓰기 가능 여부를 실제 write/remove로 확인(시크릿 모드는 존재하지만 write에서 던짐). */
function probeLocalStorage(): Storage | null {
  try {
    const ls = globalThis.localStorage
    if (!ls) return null
    const probe = `${STORAGE_NS}:__probe__`
    ls.setItem(probe, '1')
    ls.removeItem(probe)
    return ls
  } catch {
    return null
  }
}

// ────────────────────────────────────────────────────────────
// 도메인 어댑터
// ────────────────────────────────────────────────────────────

export interface StorageAdapter {
  /** 영속 저장 사용 가능 여부. false면 메모리 폴백(이번 세션만 유지) → 경고 대상. */
  readonly persistent: boolean
  /** 폴백 사유(있으면). */
  readonly reason?: string

  loadAll(): PersistedState
  /** 한 덩어리를 저장(updatedAt 갱신). 실패 시 false. */
  saveChunk<K extends StorageKey>(key: K, value: ChunkValue<K>): boolean
  /** 전체를 한 번에 저장. 하나라도 실패하면 false. */
  saveAll(state: PersistedState): boolean
  /** 모든 키 삭제. */
  clearAll(): void
}

/** 키별 저장 값 타입. */
export type ChunkValue<K extends StorageKey> = K extends 'profile'
  ? Profile | null
  : K extends 'courses'
    ? Course[]
    : K extends 'noncurricular'
      ? NonCurricularState
      : K extends 'reqsets:custom'
        ? RequirementSet[]
        : K extends 'settings'
          ? Settings
          : never

function nowIso(): string {
  return new Date().toISOString()
}

class KvStorageAdapter implements StorageAdapter {
  constructor(
    private readonly kv: KeyValueStore,
    readonly persistent: boolean,
    readonly reason?: string,
  ) {}

  private readChunk<T>(key: StorageKey): T | undefined {
    const raw = this.kv.getItem(physicalKey(key))
    if (raw == null) return undefined
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return undefined // 손상된 값은 없는 것으로 취급(덮어쓰기 가능)
    }
    if (!isEnvelope(parsed)) return undefined
    const migrated = migrateEnvelope(parsed as Envelope<T>)
    if (!migrated) return undefined
    return migrated.value
  }

  private writeChunk<T>(key: StorageKey, value: T): boolean {
    const env: Envelope<T> = { v: SCHEMA_VERSION, updatedAt: nowIso(), value }
    return this.kv.setItem(physicalKey(key), JSON.stringify(env))
  }

  loadAll(): PersistedState {
    const base = emptyPersistedState()
    const profile = this.readChunk<Profile | null>('profile')
    const courses = this.readChunk<Course[]>('courses')
    const noncurricular = this.readChunk<NonCurricularState>('noncurricular')
    const customSets = this.readChunk<RequirementSet[]>('reqsets:custom')
    const settings = this.readChunk<Settings>('settings')
    // 손상된 값은 다섯 청크 모두 "없는 것으로 취급" — 객체/배열 형까지 대칭으로 검사.
    return {
      profile: profile === null || isPlainObject(profile) ? (profile as Profile | null) : base.profile,
      courses: Array.isArray(courses) ? courses : base.courses,
      noncurricular: isPlainObject(noncurricular) ? (noncurricular as NonCurricularState) : base.noncurricular,
      customSets: Array.isArray(customSets) ? customSets : base.customSets,
      settings: isPlainObject(settings)
        ? { ...defaultSettings(), ...(settings as Partial<Settings>) }
        : defaultSettings(),
    }
  }

  saveChunk<K extends StorageKey>(key: K, value: ChunkValue<K>): boolean {
    return this.writeChunk(key, value)
  }

  saveAll(state: PersistedState): boolean {
    let ok = true
    ok = this.writeChunk('profile', state.profile) && ok
    ok = this.writeChunk('courses', state.courses) && ok
    ok = this.writeChunk('noncurricular', state.noncurricular) && ok
    ok = this.writeChunk('reqsets:custom', state.customSets) && ok
    ok = this.writeChunk('settings', state.settings) && ok
    return ok
  }

  clearAll(): void {
    for (const key of STORAGE_KEYS) this.kv.removeItem(physicalKey(key))
  }
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function isEnvelope(x: unknown): x is Envelope<unknown> {
  return (
    typeof x === 'object' &&
    x !== null &&
    'v' in x &&
    'value' in x &&
    typeof (x as { v: unknown }).v === 'number'
  )
}

/**
 * 저장소를 감지해 어댑터를 만든다. localStorage를 쓸 수 있으면 그걸, 아니면 메모리 폴백.
 * 앱 진입 시 1회 호출해 persistent/reason으로 경고 여부를 판단한다.
 */
export function detectStorage(): StorageAdapter {
  const ls = probeLocalStorage()
  if (ls) {
    return new KvStorageAdapter(new LocalStorageStore(ls), true)
  }
  return new KvStorageAdapter(
    new MemoryStore(),
    false,
    '이 브라우저(또는 시크릿 모드)에서는 데이터를 기기에 저장할 수 없어요. 이번 세션에서만 유지됩니다.',
  )
}

/** 저장된 개인 데이터를 모두 비운다(복구용). localStorage 접근을 이 계층에 가둔다. */
export function clearStoredData(): void {
  detectStorage().clearAll()
}

/** 테스트·특수 목적용: 임의 KeyValueStore로 어댑터 생성. */
export function createAdapter(kv: KeyValueStore, persistent = true, reason?: string): StorageAdapter {
  return new KvStorageAdapter(kv, persistent, reason)
}

export function createMemoryStore(): KeyValueStore {
  return new MemoryStore()
}
