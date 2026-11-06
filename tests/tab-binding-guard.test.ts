import { describe, expect, it } from 'vitest'
import { makeResource, TabBindingGuard } from '../src/runtime.ts'

function harness() {
  const guard = new TabBindingGuard()
  const calls: string[] = []
  let finish: (() => void) | undefined
  const resource = makeResource({
    bridge: { call: async (method: string) => {
      calls.push(method)
      if (method === 'tabs.activate') await new Promise<void>(resolve => { finish = resolve })
      return undefined
    } } as never,
    assertGranted: () => {},
    beforeCall: method => guard.beforeCall(method),
    afterCall: (method, generation) => guard.afterCall(method, generation),
    onClose: () => {},
  }).value
  return { guard, calls, resource, finish: () => finish?.() }
}
const signal = new AbortController().signal

describe('跨会话绑定隔离', () => {
  it('取得后必须显式 activate; tabs.open 不隐式授权页面', async () => {
    const h = harness()
    h.guard.reset()
    await h.resource.call('tabs.open', { url: 'https://example.com' }, signal)
    await expect(h.resource.call('page.snapshot', {}, signal)).rejects.toThrow('browser_select_tab')
    expect(h.calls).toEqual(['tabs.open'])
    const activate = h.resource.call('tabs.activate', { tabId: 1 }, signal)
    h.finish()
    await activate
    await h.resource.call('page.snapshot', {}, signal)
    expect(h.guard.hasSelection).toBe(true)
    h.guard.reset()
    await expect(h.resource.call('page.snapshot', {}, signal)).rejects.toThrow('browser_select_tab')
    await expect(h.resource.call('console.start', {}, signal)).rejects.toThrow('browser_select_tab')
    await expect(h.resource.call('console.read', { waitMs: 0 }, signal)).rejects.toThrow('browser_select_tab')
    await h.resource.call('console.stop', {}, signal) // 保留清理抓取的通路.
  })

  it('旧 activate 返回不能给新持有者标记绑定', async () => {
    const h = harness()
    const activate = h.resource.call('tabs.activate', { tabId: 1 }, signal)
    h.guard.reset()
    h.finish()
    await activate
    expect(h.guard.hasSelection).toBe(false)
    await expect(h.resource.call('page.snapshot', {}, signal)).rejects.toThrow('browser_select_tab')
  })

  it('失败的 activate 不授予绑定; 旧代次晚返回会失效当前绑定', () => {
    const guard = new TabBindingGuard()
    const old = guard.beforeCall('tabs.activate')
    expect(guard.hasSelection).toBe(false)
    guard.reset()
    guard.afterCall('tabs.activate', guard.beforeCall('tabs.activate'))
    expect(guard.hasSelection).toBe(true)
    guard.afterCall('tabs.activate', old)
    expect(guard.hasSelection).toBe(false)
  })
})
