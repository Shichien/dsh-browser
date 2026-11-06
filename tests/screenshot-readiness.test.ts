import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureTab } from '../extension/src/background/screenshot.js'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
function setup(state = 'minimized', activeId = 7) {
  vi.useFakeTimers()
  const api = {
    windows: { get: vi.fn().mockResolvedValue({ state }), update: vi.fn().mockResolvedValue({}) },
    tabs: {
      get: vi.fn().mockResolvedValue({ id: 7, windowId: 3 }),
      update: vi.fn().mockResolvedValue({}),
      query: vi.fn().mockResolvedValue([{ id: activeId }]),
      captureVisibleTab: vi.fn().mockResolvedValue('data:image/png;base64,YQ=='),
    },
    scripting: { executeScript: vi.fn().mockResolvedValue([{ result: { width: 800, height: 600, url: 'https://example.org' } }]) },
  }
  vi.stubGlobal('chrome', api)
  return api
}
describe('screenshot target readiness', () => {
  it('restores a minimized window before capture', async () => {
    const api = setup()
    const capture = captureTab(7, 'png')
    await vi.runAllTimersAsync()
    expect(await capture).toMatchObject({ data: 'YQ==', width: 800 })
    expect(api.windows.update).toHaveBeenCalledWith(3, { state: 'normal', focused: true })
  })
  it('preserves maximized windows', async () => {
    const api = setup('maximized')
    const capture = captureTab(7, 'png')
    await vi.runAllTimersAsync()
    await capture
    expect(api.windows.update).toHaveBeenCalledWith(3, { focused: true })
  })
  it('refuses capture if another tab became active', async () => {
    const api = setup('normal', 8)
    const checked = expect(captureTab(7, 'png')).rejects.toThrow('目标标签页已被切换')
    await vi.runAllTimersAsync()
    await checked
    expect(api.tabs.captureVisibleTab).not.toHaveBeenCalled()
  })
  it('does not swallow focus errors', async () => {
    const api = setup()
    api.windows.update.mockRejectedValue(new Error('focus failed'))
    await expect(captureTab(7, 'png')).rejects.toThrow('focus failed')
    expect(api.tabs.captureVisibleTab).not.toHaveBeenCalled()
  })
})
