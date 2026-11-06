import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeWaitTimeout, waitForText } from '../extension/src/background/page.js'
import { pageTools } from '../src/tools/page.js'
import type { BrowserRuntime } from '../src/runtime.js'
const tab = { id: 1, url: 'https://example.com/', title: 'Example', windowId: 1, active: true }
const get = vi.fn()
const executeScript = vi.fn()
const snapshot = (text: string) => [{ result: { ...tab, text, truncated: false } }]
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(0)
  get.mockReset().mockResolvedValue(tab)
  executeScript.mockReset().mockResolvedValue(snapshot('loading'))
  vi.stubGlobal('chrome', { tabs: { get }, scripting: { executeScript } })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('wait deadline', () => {
  it.each(['injection', 'tab'])('bounds stalled %s to 8 seconds', async kind => {
    const stalled = kind === 'tab' ? get : executeScript
    stalled.mockImplementation(() => new Promise(() => {}))
    const result = waitForText(1, 'ready', 8000)
    let settled = false
    void result.then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(7999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await result).toMatchObject({ found: false })
    expect(stalled).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('does not oversleep the remaining interval', async () => {
    const result = waitForText(1, 'ready', 8100)
    await vi.advanceTimersByTimeAsync(8100)
    expect(await result).toMatchObject({ found: false })
    expect(vi.getTimerCount()).toBe(0)
  })
  it('clears timer on success', async () => {
    executeScript.mockResolvedValue(snapshot('ready'))
    expect(await waitForText(1, 'ready', 8000)).toMatchObject({ found: true })
    expect(vi.getTimerCount()).toBe(0)
  })
  it('allows more than 30 seconds', async () => {
    executeScript.mockImplementation(() => Promise.resolve(snapshot(Date.now() >= 45000 ? 'ready' : 'loading')))
    const result = waitForText(1, 'ready', 60000)
    await vi.advanceTimersByTimeAsync(45200)
    expect(await result).toMatchObject({ found: true })
    expect(vi.getTimerCount()).toBe(0)
  })
  it('handles late rejection without polling again', async () => {
    let rejectRead!: (error: Error) => void
    executeScript.mockImplementation(() => new Promise((_, reject) => { rejectRead = reject }))
    const result = waitForText(1, 'ready', 8000)
    await vi.advanceTimersByTimeAsync(8000)
    expect(await result).toMatchObject({ found: false })
    rejectRead(new Error('navigation'))
    await vi.advanceTimersByTimeAsync(0)
    expect(executeScript).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each([NaN, Infinity, -Infinity, 1.5, '8000', null])('rejects invalid %s', value => {
    expect(() => normalizeWaitTimeout(value)).toThrow('timeoutMs')
  })
  it.each([[undefined, 10000], [-1, 0], [0, 0], [8000, 8000], [60000, 60000], [999999999, 60000]])('normalizes and forwards %s with RPC slack', async (input, expected) => {
    expect(normalizeWaitTimeout(input)).toBe(expected)
    const call = vi.fn().mockResolvedValue({ found: false, note: 'timeout' })
    const runtime = { run: async (_a: unknown, _s: unknown, op: (r: unknown) => unknown) => op({ call }) } as unknown as BrowserRuntime
    const tool = pageTools({ runtime }).find(t => t.name === 'browser_wait')!
    const signal = new AbortController().signal
    await tool.execute({ text: 'ready', ...(input === undefined ? {} : { timeoutMs: input }) }, { agent: { id: 'test' }, signal } as never)
    expect(call).toHaveBeenCalledWith('page.waitFor', { text: 'ready', timeoutMs: expected }, signal, { timeoutMs: expected! + 2000 })
  })
})
