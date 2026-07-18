import { describe, it, expect } from 'vitest'
import { Vector3 } from 'three'
import { slerpDirection, computeFlightFrame } from './flightPath.js'

describe('slerpDirection', () => {
  it('t=0이면 fromDir을 반환한다', () => {
    const from = new Vector3(1, 0, 0)
    const to = new Vector3(0, 1, 0)
    const d = slerpDirection(from, to, 0)
    expect(d.x).toBeCloseTo(1, 5)
    expect(d.y).toBeCloseTo(0, 5)
  })

  it('t=1이면 toDir을 반환한다', () => {
    const from = new Vector3(1, 0, 0)
    const to = new Vector3(0, 1, 0)
    const d = slerpDirection(from, to, 1)
    expect(d.x).toBeCloseTo(0, 5)
    expect(d.y).toBeCloseTo(1, 5)
  })

  it('t=0.5이면 두 방향의 이등분 대권 위 점이다 (직교 벡터 기준)', () => {
    const from = new Vector3(1, 0, 0)
    const to = new Vector3(0, 1, 0)
    const d = slerpDirection(from, to, 0.5)
    expect(d.x).toBeCloseTo(Math.SQRT1_2, 5)
    expect(d.y).toBeCloseTo(Math.SQRT1_2, 5)
    expect(d.z).toBeCloseTo(0, 5)
  })

  it('fromDir과 toDir이 같으면 그대로 반환한다 (0으로 나누기 없음)', () => {
    const from = new Vector3(0, 1, 0)
    const d = slerpDirection(from, from.clone(), 0.5)
    expect(d.x).toBeCloseTo(0, 5)
    expect(d.y).toBeCloseTo(1, 5)
    expect(d.z).toBeCloseTo(0, 5)
  })
})

describe('computeFlightFrame', () => {
  const from = new Vector3(1, 0, 0)
  const to = new Vector3(0, 1, 0)
  const radius = 10

  it('progress=0: 출발지 상공, 위치와 시선이 겹치지 않는다', () => {
    const { position, lookAt, up } = computeFlightFrame(from, to, 0, radius)
    expect(position.length()).toBeGreaterThan(radius)
    expect(lookAt.x).toBeCloseTo(radius, 4)
    expect(lookAt.y).toBeCloseTo(0, 4)
    expect(position.distanceTo(lookAt)).toBeGreaterThan(0.01)
    expect(up.length()).toBeCloseTo(1, 5)
  })

  it('progress=1: 목적지 상공에 도착한다', () => {
    const { lookAt } = computeFlightFrame(from, to, 1, radius)
    expect(lookAt.x).toBeCloseTo(0, 4)
    expect(lookAt.y).toBeCloseTo(radius, 4)
  })

  it('progress=0.5: 고도가 가장 높다 (climb peak)', () => {
    const start = computeFlightFrame(from, to, 0, radius)
    const mid = computeFlightFrame(from, to, 0.5, radius)
    const end = computeFlightFrame(from, to, 1, radius)
    expect(mid.position.length()).toBeGreaterThan(start.position.length())
    expect(mid.position.length()).toBeGreaterThan(end.position.length())
  })

  it('progress를 [0,1] 밖으로 줘도 클램프된다', () => {
    const under = computeFlightFrame(from, to, -0.5, radius)
    const over = computeFlightFrame(from, to, 1.5, radius)
    const atZero = computeFlightFrame(from, to, 0, radius)
    const atOne = computeFlightFrame(from, to, 1, radius)
    expect(under.position.distanceTo(atZero.position)).toBeCloseTo(0, 4)
    expect(over.position.distanceTo(atOne.position)).toBeCloseTo(0, 4)
  })
})
