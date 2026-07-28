import { describe, it, expect } from 'vitest'
import { classifyRenderer } from './classifyRenderer.js'

describe('classifyRenderer', () => {
  it('소프트웨어 렌더러 시그니처는 software로 분류한다', () => {
    const soft = [
      'Google SwiftShader',
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))',
      'llvmpipe (LLVM 15.0.7, 256 bits)',
      'Gallium 0.4 on softpipe',
      'Mesa OffScreen',
      'Microsoft Basic Render Driver',
      'Software Rasterizer',
    ]
    for (const r of soft) expect(classifyRenderer(r)).toBe('software')
  })

  it('실제 GPU 렌더러는 hardware로 분류한다', () => {
    const hw = [
      'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Intel(R) Iris(TM) Plus Graphics',
      'AMD Radeon Pro 5500M OpenGL Engine',
    ]
    for (const r of hw) expect(classifyRenderer(r)).toBe('hardware')
  })

  it('문자열을 가져올 수 없으면 unknown으로 남겨 오탐을 피한다', () => {
    expect(classifyRenderer(null)).toBe('unknown')
    expect(classifyRenderer(undefined)).toBe('unknown')
    expect(classifyRenderer('')).toBe('unknown')
    expect(classifyRenderer('   ')).toBe('unknown')
    expect(classifyRenderer(0)).toBe('unknown')
  })
})
