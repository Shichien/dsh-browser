/**
 * 就绪判定: 什么时候不该打扰用户.
 *
 * 这段判定决定"要不要弹授权请求". 它出错的两个方向都很难受:
 *
 *   - 过松 -> 什么都没配好就弹窗, 用户同意之后仍然什么都做不了;
 *   - 过严 -> 明明能用却一直说"没配好", 用户找不到出路.
 *
 * 所以这里把两边都钉住, 并且验证说明文本里确实有可照做的步骤 (它是要被模型转述给用户的,
 * 只有"没配好"三个字等于让用户自己猜).
 */

import { describe, expect, it } from 'vitest'
import { evaluateSetup, setupGaps } from '../src/setup.ts'
import type { SetupInput } from '../src/setup.ts'
import { checks } from '../src/client/checks.ts'
import type { StatusPayload } from '../shared/status.ts'

/** 一份"完全配好且扩展已连上"的输入; 各用例只改自己关心的字段. */
const READY: SetupInput = {
  manifestReady: true,
  extensionReady: true,
  extensionDir: '/data/dsh-browser/extension',
  pairingConfigured: true,
  // 基准保持"要求配对"的上游语义, 于是下面几条继续钉住配对那条路; 本 fork 的默认值
  // (不要求配对) 由紧跟其后的专门用例覆盖.
  requirePairing: true,
  pairingError: null,
  bridgeConnected: true,
  launchStandaloneChromeProfile: false,
}

/**
 * 在基准之上改几个字段.
 *
 * @param patch 要覆盖的字段.
 * @returns 新的判定输入.
 */
function withPatch(patch: Partial<SetupInput>): SetupInput {
  return { ...READY, ...patch }
}

/**
 * 造一份配置页要读的完整状态, 只覆盖关心的字段.
 *
 * 配置页那一行 (checkPairing) 读的是 StatusPayload 而不是 SetupInput, 所以这里单独造一份;
 * 字段值与 READY 对齐, 免得两处基准漂移.
 *
 * @param patch 要覆盖的字段.
 * @returns 完整状态.
 */
function statusWith(patch: Partial<StatusPayload>): StatusPayload {
  return {
    chromePath: '/usr/bin/google-chrome',
    chromeSource: 'standard-path',
    chromeError: null,
    profileDir: '/data/dsh-browser/profile',
    dataDir: '/data/dsh-browser',
    extensionId: 'hfbmjjcgbobkpmmkhfjgebcojhjpdokd',
    extensionDir: '/data/dsh-browser/extension',
    manifestPath: '/data/dsh-browser/native-host/com.azazo1.dsh_browser.json',
    manifestReady: true,
    manifestStale: false,
    interpreter: '/usr/local/bin/node',
    bridgeConnected: true,
    peerUserDataDir: null,
    extensionVersion: '0.1.0',
    boundTabId: null,
    userScriptsAvailable: null,
    bridgeError: null,
    launchStandaloneChromeProfile: false,
    holderId: null,
    pairingConfigured: true,
    requirePairing: true,
    pairingError: null,
    launchArgs: null,
    manualSteps: [],
    ready: true,
    ...patch,
  }
}

/**
 * 取配置页某一行的状态.
 *
 * @param status 状态.
 * @param key 行的键.
 * @returns 该行状态.
 */
function stateOf(status: StatusPayload, key: string): string {
  const row = checks(status).find(candidate => candidate.key === key)
  expect(row, `找不到 ${key} 这一行`).toBeDefined()
  return row!.state
}

describe('就绪判定', () => {
  it('都齐了就是就绪, 而且不给说明', () => {
    const status = evaluateSetup(READY)
    expect(status.ready).toBe(true)
    expect(status.gaps).toEqual([])
    expect(status.guide).toBe('')
  })

  it('连接组件没装 -> 不就绪, 并指向配置页的安装按钮', () => {
    const status = evaluateSetup(withPatch({ manifestReady: false }))
    expect(status.ready).toBe(false)
    expect(status.gaps.join(' ')).toContain('连接组件')
    expect(status.guide).toContain('安装连接组件')
  })

  it('没填配对令牌 -> 不就绪, 并说清去哪抄', () => {
    const status = evaluateSetup(withPatch({ pairingConfigured: false }))
    expect(status.ready).toBe(false)
    expect(status.gaps.join(' ')).toContain('配对令牌')
    expect(status.guide).toContain('配对令牌输入框')
    // 模型被告知要讲给用户, 而不是自己反复重试.
    expect(status.guide).toContain('讲给用户')
  })

  it('配对失败 -> 不就绪, 而且把失败原因带出来', () => {
    const status = evaluateSetup(withPatch({ pairingError: '配对令牌不一致' }))
    expect(status.ready).toBe(false)
    // 只说"没配好"用户找不到错在哪, 所以原因必须出现在文本里.
    expect(status.gaps.join(' ')).toContain('配对令牌不一致')
  })

  it('扩展没连上且不允许自行启动 -> 不就绪, 并让用户打开他自己的 Chrome', () => {
    const status = evaluateSetup(withPatch({ bridgeConnected: false }))
    expect(status.ready).toBe(false)
    expect(status.gaps.join(' ')).toContain('自己的 Chrome')
    expect(status.guide).toContain('保持运行')
  })

  it('扩展没连上但允许自行启动 -> 也算就绪 (有可走的路)', () => {
    const input = withPatch({ bridgeConnected: false, launchStandaloneChromeProfile: true })
    // 这一条很关键: 允许启动自带 Chrome 时, "还没连上"就是正常的第一步, 不该当成没配好
    // 而拒绝 —— 那会让这条路径永远走不通.
    expect(evaluateSetup(input).ready).toBe(true)
  })

  it('扩展产物不在 -> 不就绪, 并给出该选哪个文件夹', () => {
    const status = evaluateSetup(withPatch({ extensionReady: false }))
    expect(status.ready).toBe(false)
    expect(status.gaps.join(' ')).toContain('/data/dsh-browser/extension')
    // 用户要在"加载已解压的扩展程序"里选文件夹, 所以路径必须出现在说明里.
    expect(status.guide).toContain('/data/dsh-browser/extension')
  })

  it('多项缺失时逐项列出, 而不是只说一句没配好', () => {
    const status = evaluateSetup(withPatch({
      manifestReady: false,
      pairingConfigured: false,
      bridgeConnected: false,
    }))
    expect(status.ready).toBe(false)
    // 三项都缺时用户要一次看到全部, 否则修一个发现还有下一个.
    expect(status.gaps.length).toBe(3)
    const guide = status.guide
    expect(guide).toContain('安装连接组件')
    expect(guide).toContain('配对令牌输入框')
    expect(guide).toContain('chrome://extensions')
    // 不给"换个工具试试"的错觉.
    expect(guide).toContain('不要反复重试')
  })

  it('只缺可选能力时仍然就绪 (求值开关不影响整体可用)', () => {
    // browser_evaluate 需要额外的手动开关, 但不开也能用其余工具, 所以它不该进 gaps.
    expect(setupGaps(READY)).toEqual([])
  })

  it('本 fork 默认不要求配对: 没填令牌也算就绪', () => {
    // 这是本 fork 与上游的第一处语义差异. 关掉配对时"没填令牌"不该再挡路, 否则装好扩展的
    // 用户会永远停在一句"dsh 侧还没填配对令牌"上, 而那条路其实已经通了.
    const status = evaluateSetup(withPatch({ requirePairing: false, pairingConfigured: false }))
    expect(status.ready).toBe(true)
    expect(status.gaps).toEqual([])
  })

  it('不要求配对时, 配置页那行不再是 error', () => {
    const status = statusWith({ requirePairing: false, pairingConfigured: false })
    expect(stateOf(status, 'checkPairing')).toBe('done')
  })
})
