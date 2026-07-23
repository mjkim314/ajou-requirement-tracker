import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  evaluate,
  type EvaluationInput,
  type EvaluationResult,
  type NonCurricularState,
  type RequirementSet,
} from '../engine/index'
import { detectStorage, type StorageAdapter } from '../storage/adapter'
import { emptyPersistedState, type PersistedState, type Settings } from '../storage/schema'
import type { PersonalBackup, ReqsetShare } from '../storage/schema'
import { evaluateBackupReminder, semesterEndPeriod, type BackupReminder } from './backup-reminder'
import {
  backupFilename,
  backupToState,
  buildPersonalBackup,
  buildReqsetShare,
  downloadJson,
  serialize,
} from '../storage/backup'
import { normalizeReqSetGroups, resolveInput, resolveReqSet } from './dataSources'
import { requirementSetRegistry } from '../data/index'
import { demoPersistedState } from './appData'
import { draftToCourse, type CourseDraft } from './courses'
import { cloneReqSet, uniqueId } from './reqset-editor'
import type { OnboardingCommit } from './onboarding/model'

export type TabId = 'summary' | 'courses' | 'requirements' | 'settings'

/** 과목 record id 생성. crypto.randomUUID 우선, 없으면 시각+난수 폴백. */
function newCourseId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return `c_${uuid}`
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

interface AppStateValue {
  // 데이터
  state: PersistedState
  input: EvaluationInput | null
  result: EvaluationResult | null
  reqSet: RequirementSet | null
  /** 요약을 그릴 수 있는 실제 데이터가 있는지. */
  hasData: boolean
  /** 지금 백업 리마인더 배너를 띄울지(없으면 null). 요약 탭 상단에서 사용. */
  backupReminder: BackupReminder | null

  // 저장소 상태
  persistent: boolean
  storageReason?: string
  /** 마지막 저장 시도 성공 여부. false면 저장 실패 경고를 띄운다(입력은 유지). */
  saveOk: boolean

  // 내비게이션
  activeTab: TabId
  setActiveTab: (tab: TabId) => void
  /** 과목 탭이 열리면 추가 폼을 띄워야 하는지(다른 탭에서 요청됨). */
  pendingAddCourse: boolean
  /** 다른 탭(요약 빈 상태 등)에서 과목 추가를 시작 — 과목 탭으로 이동 + 폼 열기 요청. */
  requestAddCourse: () => void
  /** CoursesTab이 폼을 연 뒤 요청 플래그를 소비(재방문 시 폼이 다시 열리지 않게). */
  consumeAddCourse: () => void

  // 액션
  loadDemo: () => void
  completeOnboarding: (commit: OnboardingCommit, backedUpAt?: string) => void
  /** 백업 리마인더 배너 닫기 — 7일간 숨김(학기말 강조면 그 학기도 처리 표시). */
  dismissBackupReminder: () => void
  /** 온보딩 다시 하기 — 프로필만 비워 마법사를 재진입(과목·요건 세트·설정은 유지). */
  restartOnboarding: () => void
  addCourse: (draft: CourseDraft) => void
  updateCourse: (id: string, draft: CourseDraft) => void
  removeCourse: (id: string) => void
  /** 비교과 진행 상태(요건 탭 체크리스트). 전체 맵을 교체 — 호출부가 reqset-editor 헬퍼로 계산. */
  setNonCurricular: (next: NonCurricularState) => void
  /** 편집한 요건 세트 저장 — customSets에 upsert하고 활성 세트로 전환. */
  saveEditedReqSet: (set: RequirementSet) => void
  /** 활성 세트를 새 이름으로 복제 → customSets 추가 + 활성 전환. */
  cloneActiveReqSet: (newName: string) => void
  /** 활성 요건 세트 전환(프리셋 또는 커스텀 id). */
  switchReqSet: (setId: string) => void
  /** 커스텀 세트 삭제. 활성 세트는 삭제하지 않는다(가드). */
  deleteCustomSet: (setId: string) => void
  exportPersonalBackup: () => void
  exportActiveReqset: () => void
  applyPersonalBackup: (backup: PersonalBackup) => void
  applyReqsetShare: (share: ReqsetShare) => void
  resetAll: () => void
}

const AppStateContext = createContext<AppStateValue | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  // 저장소는 앱 진입 시 1회 감지(어댑터는 이 계층에서만 잡는다).
  const adapterRef = useRef<StorageAdapter | null>(null)
  if (!adapterRef.current) adapterRef.current = detectStorage()
  const adapter = adapterRef.current

  const [state, setState] = useState<PersistedState>(() => adapter.loadAll())
  const initialStateRef = useRef(state)
  const [activeTab, setActiveTab] = useState<TabId>('summary')
  const [saveOk, setSaveOk] = useState(true)
  const [pendingAddCourse, setPendingAddCourse] = useState(false)

  // 실제 변경이 있을 때만 영속화(전체 덩어리). 방금 로드한 초기 상태를 그대로 되쓰지 않는다
  // → updatedAt의 "마지막 변경 시각" 의미 보존 + 불필요한 쓰기 방지(참조 비교라 StrictMode에도 안전).
  // 실패해도 예외 없이 saveOk로만 알린다 → 입력은 화면에 유지.
  useEffect(() => {
    if (state === initialStateRef.current) return
    setSaveOk(adapter.saveAll(state))
  }, [state, adapter])

  const input = useMemo(() => resolveInput(state), [state])
  const result = useMemo(() => (input ? evaluate(input) : null), [input])
  const reqSet = useMemo(() => resolveReqSet(state), [state])

  // 백업 리마인더는 과목 수·설정(백업/닫기 이력)에 의존. 시각은 매 재계산 시 읽는다
  // (30일 단위 판정이라 세션 중 시간 경과 정밀도는 불필요 — 상태가 바뀔 때만 갱신).
  const backupReminder = useMemo(
    () => evaluateBackupReminder({ now: new Date(), courseCount: state.courses.length, settings: state.settings }),
    [state.courses.length, state.settings],
  )
  // 닫기는 '지금 화면에 떠 있는' 배너 기준으로 처리한다. 핸들러에서 시각을 다시 읽어 재평가하면
  // 학기말 창 경계(자정 등)에서 다른 배너로 오인해 학기말 강조를 잘못 소진할 수 있어, ref로 표시값을 참조.
  const backupReminderRef = useRef(backupReminder)
  backupReminderRef.current = backupReminder

  useEffect(() => {
    if (import.meta.env.DEV && result) console.info('[엔진 연결] evaluate() →', result)
  }, [result])

  const loadDemo = useCallback(() => setState(demoPersistedState()), [])

  const completeOnboarding = useCallback((commit: OnboardingCommit, backedUpAt?: string) => {
    // 프로필 확정 + 온보딩이 만든 커스텀 세트를 병합(같은 id는 덮어씀). 저장은 effect가 처리.
    setState((s) => {
      const byId = new Map(s.customSets.map((x) => [x.id, x]))
      for (const set of commit.customSets) byId.set(set.id, set)
      return {
        ...s,
        profile: commit.profile,
        customSets: [...byId.values()],
        // 완료 화면에서 백업을 받았으면 그 시각과 과목 수(온보딩 시점 기준선)를 기록.
        settings: backedUpAt
          ? { ...s.settings, lastBackupAt: backedUpAt, courseCountAtLastBackup: s.courses.length }
          : s.settings,
      }
    })
    setActiveTab('summary')
  }, [])

  const dismissBackupReminder = useCallback(() => {
    const shown = backupReminderRef.current // 표시 중인 배너 기준으로 판정(재평가 안 함).
    const iso = new Date().toISOString() // 닫은 시각(업데이터는 순수 — StrictMode 이중 실행 대비).
    setState((s) => {
      const patch: Partial<Settings> = { bannerDismissedAt: iso }
      // 방금 닫은 게 학기말 강조 배너면 그 학기는 처리 완료 표시(학기당 1회).
      if (shown?.reason === 'semester' && shown.period) patch.semesterNudgeShownFor = shown.period
      return { ...s, settings: { ...s.settings, ...patch } }
    })
  }, [])

  const restartOnboarding = useCallback(() => {
    // 프로필만 비우면 App이 온보딩 마법사를 띄운다. 과목·요건 세트·설정은 유지.
    setState((s) => ({ ...s, profile: null }))
  }, [])

  const requestAddCourse = useCallback(() => {
    setActiveTab('courses')
    setPendingAddCourse(true)
  }, [])

  const consumeAddCourse = useCallback(() => setPendingAddCourse(false), [])

  const addCourse = useCallback((draft: CourseDraft) => {
    setState((s) => ({ ...s, courses: [...s.courses, draftToCourse(draft, newCourseId())] }))
  }, [])

  const updateCourse = useCallback((id: string, draft: CourseDraft) => {
    setState((s) => ({
      ...s,
      courses: s.courses.map((c) => (c.id === id ? draftToCourse(draft, id) : c)),
    }))
  }, [])

  const removeCourse = useCallback((id: string) => {
    // 삭제하는 과목을 재수강 대상으로 참조하던 다른 기록의 retakeOf를 정리(고아 참조 방지).
    setState((s) => ({
      ...s,
      courses: s.courses
        .filter((c) => c.id !== id)
        .map((c) => (c.retakeOf === id ? { ...c, retakeOf: null } : c)),
    }))
  }, [])

  const setNonCurricular = useCallback((next: NonCurricularState) => {
    setState((s) => ({ ...s, noncurricular: next }))
  }, [])

  const saveEditedReqSet = useCallback((set: RequirementSet) => {
    // 시각은 핸들러에서 1회 산출(setState 업데이터는 순수하게 유지 — StrictMode 이중 실행 대비).
    const now = new Date().toISOString()
    setState((s) => {
      if (!s.profile) return s
      const withTime: RequirementSet = { ...set, updatedAt: now }
      const byId = new Map(s.customSets.map((x) => [x.id, x]))
      byId.set(withTime.id, withTime) // 같은 id면 덮어씀, 새 id면 추가.
      return {
        ...s,
        customSets: [...byId.values()],
        profile: { ...s.profile, requirementSetId: withTime.id },
      }
    })
  }, [])

  const cloneActiveReqSet = useCallback((newName: string) => {
    const now = new Date().toISOString()
    setState((s) => {
      const active = resolveReqSet(s)
      if (!active || !s.profile) return s
      const id = uniqueId(`${active.id}__copy`, s.customSets.map((x) => x.id))
      const copy = cloneReqSet(active, { id, name: newName.trim() || `${active.name} 사본`, now })
      return {
        ...s,
        customSets: [...s.customSets, copy],
        profile: { ...s.profile, requirementSetId: id },
      }
    })
  }, [])

  const switchReqSet = useCallback((setId: string) => {
    // 같은 세트면 참조를 그대로 반환 → 불필요한 재렌더·재저장 방지.
    setState((s) =>
      s.profile && s.profile.requirementSetId !== setId
        ? { ...s, profile: { ...s.profile, requirementSetId: setId } }
        : s,
    )
  }, [])

  const deleteCustomSet = useCallback((setId: string) => {
    setState((s) => {
      // 활성 세트는 삭제하지 않는다(참조가 끊겨 복구 카드로 빠지는 것 방지). UI도 버튼을 막는다.
      if (s.profile?.requirementSetId === setId) return s
      return { ...s, customSets: s.customSets.filter((x) => x.id !== setId) }
    })
  }, [])

  const exportPersonalBackup = useCallback(() => {
    // 다운로드(부수효과)는 이벤트 핸들러에서 1회만 — setState 업데이터 안에 넣지 않는다
    // (업데이터는 순수해야 하고 StrictMode에서 이중 실행된다).
    const now = new Date()
    const iso = now.toISOString()
    const period = semesterEndPeriod(now)
    // 파일과 저장 상태에 '갱신 후' settings를 동일하게 담는다 — 그래야 복원한 기기에서
    // 방금 백업한 파일을 '백업한 적 없음/기준선 어긋남'으로 오판하지 않는다.
    // (백업 시각·과목 수 기록, 이전 닫기 해제, 학기말 창이면 그 학기 강조도 처리 완료.)
    const nextSettings: Settings = {
      ...state.settings,
      lastBackupAt: iso,
      courseCountAtLastBackup: state.courses.length,
      bannerDismissedAt: null,
      ...(period ? { semesterNudgeShownFor: period } : {}),
    }
    downloadJson(
      backupFilename('ajou-grad-backup', state.profile?.admissionYear ?? null, now),
      serialize(buildPersonalBackup({ ...state, settings: nextSettings }, iso)),
    )
    setState((s) => ({ ...s, settings: nextSettings }))
  }, [state])

  const exportActiveReqset = useCallback(() => {
    const active = resolveReqSet(state)
    // 활성 세트는 resolveReqSet가 이미 정규화. 폴백(활성 없음)의 커스텀 세트도 정규화해
    // 구버전 그룹 값(major/free)이 공유 파일에 새어 나가지 않게 한다.
    const sets = active ? [active] : state.customSets.map(normalizeReqSetGroups)
    if (sets.length === 0) return
    const now = new Date()
    downloadJson(
      backupFilename('ajou-grad-reqset', null, now),
      serialize(buildReqsetShare(sets, now.toISOString())),
    )
  }, [state])

  const applyPersonalBackup = useCallback((backup: PersonalBackup) => {
    setState(backupToState(backup))
  }, [])

  const applyReqsetShare = useCallback((share: ReqsetShare) => {
    // 항상 '추가'로 동작한다(설정 화면 안내와 일치). 들여오는 세트 id가 기존 커스텀 세트나
    // 번들 프리셋 id와 충돌하면 새 id를 부여 — 내 편집본을 조용히 덮어쓰거나(데이터 소실)
    // 번들 프리셋을 같은 id로 그림자 처리(정정 미전파)하는 것을 막는다.
    setState((s) => {
      const taken = new Set<string>([
        ...s.customSets.map((x) => x.id),
        ...Object.keys(requirementSetRegistry),
      ])
      const additions = share.requirementSets.map((set) => {
        if (!taken.has(set.id)) {
          taken.add(set.id)
          return set
        }
        const id = uniqueId(`${set.id}__shared`, taken)
        taken.add(id)
        return { ...set, id }
      })
      return { ...s, customSets: [...s.customSets, ...additions] }
    })
  }, [])

  const resetAll = useCallback(() => {
    adapter.clearAll()
    setState(emptyPersistedState())
  }, [adapter])

  const value = useMemo<AppStateValue>(
    () => ({
      state,
      input,
      result,
      reqSet,
      hasData: result != null,
      backupReminder,
      persistent: adapter.persistent,
      ...(adapter.reason ? { storageReason: adapter.reason } : {}),
      saveOk,
      activeTab,
      setActiveTab,
      pendingAddCourse,
      requestAddCourse,
      consumeAddCourse,
      loadDemo,
      completeOnboarding,
      dismissBackupReminder,
      restartOnboarding,
      addCourse,
      updateCourse,
      removeCourse,
      setNonCurricular,
      saveEditedReqSet,
      cloneActiveReqSet,
      switchReqSet,
      deleteCustomSet,
      exportPersonalBackup,
      exportActiveReqset,
      applyPersonalBackup,
      applyReqsetShare,
      resetAll,
    }),
    [
      state,
      input,
      result,
      reqSet,
      backupReminder,
      adapter,
      saveOk,
      activeTab,
      pendingAddCourse,
      requestAddCourse,
      consumeAddCourse,
      loadDemo,
      completeOnboarding,
      dismissBackupReminder,
      restartOnboarding,
      addCourse,
      updateCourse,
      removeCourse,
      setNonCurricular,
      saveEditedReqSet,
      cloneActiveReqSet,
      switchReqSet,
      deleteCustomSet,
      exportPersonalBackup,
      exportActiveReqset,
      applyPersonalBackup,
      applyReqsetShare,
      resetAll,
    ],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState는 AppStateProvider 안에서만 쓸 수 있습니다')
  return ctx
}
