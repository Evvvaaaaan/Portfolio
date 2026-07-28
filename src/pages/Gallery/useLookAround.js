import { useCallback, useRef } from 'react'
import { clampPitch, stepYaw } from './ring.js'

// 드래그로 시선을 돌리는 입력. 방위(yaw)는 되감지 않고 계속 누적한다 —
// ±180에서 되감으면 그 순간 링이 한 바퀴 튄다.
//
// 방향은 "배경을 잡아 끄는" 감각을 따른다: 오른쪽으로 끌면 시선이 왼쪽으로
// 돈다(yaw 감소). 회전 상태는 React state가 아니라 ref에 둔다 — 60fps로
// 패널 14개를 리렌더할 이유가 없다.

const DRAG_THRESHOLD_PX = 6
const YAW_PER_PX = 0.22
const PITCH_PER_PX = 0.12
const INERTIA_DAMPING = 3.2   // 초당 감쇠율
const MIN_INERTIA = 0.4       // 도/초 — 이 아래면 멈춘다
const SNAP_RATE = 6.0         // 화살표/키보드 스냅 속도

export default function useLookAround(count, { enabled, reducedMotion }) {
  const orientationRef = useRef({ yaw: 0, pitch: 0 })
  const velocityRef = useRef(0)
  const targetRef = useRef(null)
  const dragRef = useRef({ active: false, moved: false, x: 0, y: 0, lastX: 0, lastT: 0 })

  const onPointerDown = useCallback((e) => {
    if (!enabled) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    targetRef.current = null
    velocityRef.current = 0
    dragRef.current = {
      active: true,
      moved: false,
      x: e.clientX,
      y: e.clientY,
      lastX: e.clientX,
      lastT: performance.now(),
    }
  }, [enabled])

  const onPointerMove = useCallback((e) => {
    const drag = dragRef.current
    if (!drag.active) return

    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
      drag.moved = true
    }

    const o = orientationRef.current
    o.yaw -= dx * YAW_PER_PX
    o.pitch = clampPitch(o.pitch + dy * PITCH_PER_PX)

    // 관성용 순간 속도(도/초)
    const now = performance.now()
    const dt = Math.max(1, now - drag.lastT) / 1000
    velocityRef.current = (-(e.clientX - drag.lastX) * YAW_PER_PX) / dt

    drag.x = e.clientX
    drag.y = e.clientY
    drag.lastX = e.clientX
    drag.lastT = now
  }, [])

  const endDrag = useCallback(() => {
    const drag = dragRef.current
    if (!drag.active) return
    drag.active = false
    if (reducedMotion || !drag.moved) velocityRef.current = 0
  }, [reducedMotion])

  const onWheel = useCallback((e) => {
    if (!enabled) return
    e.preventDefault()
    targetRef.current = null
    orientationRef.current.yaw += e.deltaY * 0.08 + e.deltaX * 0.08
    velocityRef.current = 0
  }, [enabled])

  const stepBy = useCallback((dir) => {
    if (!enabled) return
    velocityRef.current = 0
    targetRef.current = stepYaw(orientationRef.current.yaw, count, dir)
  }, [enabled, count])

  const snapToYaw = useCallback((targetYawDeg) => {
    if (!enabled) return
    velocityRef.current = 0
    targetRef.current = targetYawDeg
  }, [enabled])

  const nudgePitch = useCallback((deltaDeg) => {
    if (!enabled) return
    const o = orientationRef.current
    o.pitch = clampPitch(o.pitch + deltaDeg)
  }, [enabled])

  const tick = useCallback((dtSec) => {
    const o = orientationRef.current

    // 화살표/키보드로 지정한 목표가 있으면 그쪽으로 이징
    if (targetRef.current !== null) {
      const diff = targetRef.current - o.yaw
      if (Math.abs(diff) < 0.05) {
        o.yaw = targetRef.current
        targetRef.current = null
      } else {
        o.yaw += diff * Math.min(1, SNAP_RATE * dtSec)
      }
      return
    }

    // 손을 뗀 뒤 관성
    if (!dragRef.current.active && velocityRef.current !== 0) {
      o.yaw += velocityRef.current * dtSec
      velocityRef.current *= Math.exp(-INERTIA_DAMPING * dtSec)
      if (Math.abs(velocityRef.current) < MIN_INERTIA) velocityRef.current = 0
    }
  }, [])

  const wasDrag = useCallback(() => dragRef.current.moved, [])

  return {
    orientationRef,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onWheel,
    },
    stepBy,
    snapToYaw,
    nudgePitch,
    tick,
    wasDrag,
  }
}
