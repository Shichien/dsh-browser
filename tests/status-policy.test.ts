import { describe, expect, it } from 'vitest'
import { Config } from '../src/config.ts'
import { describeBridgeError } from '../src/runtime.ts'
import type { BrowserStatus, BrowserRuntime } from '../src/runtime.ts'
import { formatStatus } from '../src/tools/shared.ts'
import { sessionTools } from '../src/tools/session.ts'

function status(patch: Partial<BrowserStatus> = {}): BrowserStatus {
  return {
    chrome: { path: 'chrome', source: 'configured' }, chromeError: null,
    profileDir: 'profile', dataDir: 'data', host: { manifestReady: true } as BrowserStatus['host'],
    hostError: null, bridgeConnected: true, extensionVersion: 'test', userScriptsAvailable: true,
    launchStandaloneChromeProfile: false, pairingConfigured: false, pairingError: 'old pairing rejection',
    requirePairing: false, askOnAcquire: false, holderId: null, boundTabId: null,
    bridgeError: null, launchArgs: null, peerUserDataDir: null, consoleCapturing: null,
    nextSteps: [], ...patch,
  }
}

describe('配置与模型状态一致', () => {
  it('fork 默认关闭审批和配对, 仍能显式开启', () => {
    expect(Config({}).askOnAcquire.get()).toBe(false)
    expect(Config({}).requirePairing.get()).toBe(false)
    expect(Config({ askOnAcquire: true, requirePairing: true }).requirePairing.get()).toBe(true)
  })
  it.each([true, false])('摘要跟随 askOnAcquire=%s', required => {
    const text = formatStatus(status({ askOnAcquire: required }), 'self')
    expect(text.includes('先弹审批申请')).toBe(required)
    expect(text.includes('静默取得驱动权')).toBe(!required)
    expect(text).not.toContain('old pairing rejection')
  })
  it.each([true, false])('browser_status.ready 跟随 requirePairing=%s', async required => {
    const runtime = { status: async () => status({ requirePairing: required }) } as BrowserRuntime
    const tool = sessionTools({ runtime }).find(tool => tool.name === 'browser_status')!
    const value = await tool.execute({}, { agent: { id: 'self' } } as never) as { ready: boolean }
    expect(value.ready).toBe(!required)
  })
})

describe('按失败原因恢复', () => {
  it('关闭标签页时重新绑定, 元素失效时重新取快照', () => {
    expect(describeBridgeError({ code: 'stale-target', message: '标签页 12 已经关闭' })).toContain('browser_select_tab')
    expect(describeBridgeError({ code: 'stale-target', message: '元素已移除' })).toContain('browser_snapshot')
  })
  it('文件输入框用选择器排查, 普通元素用编号排查', () => {
    expect(describeBridgeError({ code: 'unknown-element', message: '选择器 x 没有文件输入框' })).toContain('browser_query')
    expect(describeBridgeError({ code: 'unknown-element', message: '编号 1 不存在' })).toContain('browser_snapshot')
  })
  it('超时不再直接推荐另一次 browser_wait', () => {
    expect(describeBridgeError({ code: 'timeout', message: '超时' })).not.toContain('browser_wait')
  })
})
