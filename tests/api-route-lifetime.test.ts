import { describe, expect, it, vi } from 'vitest'
import { registerApi } from '../src/server.js'

describe('API route lifetime', () => {
  it('releases its route when the plugin scope is disposed, allowing reload', () => {
    let occupied = false
    const disposers: (() => void)[] = []
    const register = vi.fn(() => {
      if (occupied) throw new Error('duplicate route')
      occupied = true
      return () => { occupied = false }
    })
    const context = {
      webServer: { register },
      effect: (factory: () => () => void) => { disposers.push(factory()) },
    }
    const install = () => registerApi(context as never, {} as never, {} as never, {} as never)
    install()
    expect(occupied).toBe(true)
    expect(disposers).toHaveLength(1)
    disposers.pop()!()
    expect(occupied).toBe(false)
    expect(install).not.toThrow()
    expect(register).toHaveBeenCalledTimes(2)
    disposers.pop()!()
  })
})
