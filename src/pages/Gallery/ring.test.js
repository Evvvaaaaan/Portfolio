import { describe, it, expect } from 'vitest'
import {
  wrapDeg,
  clampPitch,
  panelAngle,
  signedOffset,
  activeIndex,
  stepYaw,
  yawForIndex,
  panelGeometry,
  isDragGesture,
  PITCH_LIMIT_DEG,
} from './ring.js'

describe('wrapDeg', () => {
  it('통과 구간은 그대로 둔다', () => {
    expect(wrapDeg(0)).toBe(0)
    expect(wrapDeg(90)).toBe(90)
    expect(wrapDeg(-90)).toBe(-90)
  })

  it('±180을 넘으면 되감는다', () => {
    expect(wrapDeg(190)).toBeCloseTo(-170)
    expect(wrapDeg(-190)).toBeCloseTo(170)
    expect(wrapDeg(360)).toBeCloseTo(0)
    expect(wrapDeg(725)).toBeCloseTo(5)
  })

  it('180은 180으로 남고 -180은 180으로 접힌다', () => {
    expect(wrapDeg(180)).toBe(180)
    expect(wrapDeg(-180)).toBe(180)
  })
})

describe('clampPitch', () => {
  it('한계 안에서는 그대로', () => {
    expect(clampPitch(10)).toBe(10)
    expect(clampPitch(-10)).toBe(-10)
  })

  it('한계를 넘으면 잘린다', () => {
    expect(clampPitch(90)).toBe(PITCH_LIMIT_DEG)
    expect(clampPitch(-90)).toBe(-PITCH_LIMIT_DEG)
  })
})

describe('panelAngle', () => {
  it('14개를 균등 분할한다', () => {
    expect(panelAngle(0, 14)).toBe(0)
    expect(panelAngle(1, 14)).toBeCloseTo(360 / 14)
    expect(panelAngle(13, 14)).toBeCloseTo((360 / 14) * 13)
  })
})

describe('signedOffset', () => {
  it('yaw가 패널 각도와 같으면 정면(0)', () => {
    expect(signedOffset(3, 14, panelAngle(3, 14))).toBeCloseTo(0)
  })

  it('항상 최단 방향을 고른다', () => {
    // 패널 13은 각도 334.3°. yaw 0에서 최단 경로는 -25.7°이지 +334.3°가 아니다.
    expect(signedOffset(13, 14, 0)).toBeCloseTo(-360 / 14)
  })

  it('yaw 랩어라운드를 넘어도 성립한다', () => {
    expect(signedOffset(0, 14, 720)).toBeCloseTo(0)
    expect(signedOffset(0, 14, -360)).toBeCloseTo(0)
  })
})

describe('activeIndex', () => {
  it('yaw 0이면 0번', () => {
    expect(activeIndex(14, 0)).toBe(0)
  })

  it('한 칸 회전하면 다음 패널', () => {
    expect(activeIndex(14, 360 / 14)).toBe(1)
    expect(activeIndex(14, -360 / 14)).toBe(13)
  })

  it('경계 직전까지는 아직 이전 패널이다', () => {
    const step = 360 / 14
    expect(activeIndex(14, step * 0.49)).toBe(0)
    expect(activeIndex(14, step * 0.51)).toBe(1)
  })

  it('여러 바퀴를 돌아도 범위 안이다', () => {
    for (const yaw of [0, 1234, -987, 360 * 5 + 3]) {
      const i = activeIndex(14, yaw)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(14)
    }
  })
})

describe('stepYaw', () => {
  it('한 칸씩 더하고 뺀다', () => {
    expect(stepYaw(0, 14, 1)).toBeCloseTo(360 / 14)
    expect(stepYaw(0, 14, -1)).toBeCloseTo(-360 / 14)
  })

  it('누적 yaw를 유지해 되감기 점프가 없다', () => {
    // 720에서 한 칸 가면 745.7이어야 한다 — 25.7로 되감기면 화면이 튄다.
    expect(stepYaw(720, 14, 1)).toBeCloseTo(720 + 360 / 14)
  })
})

describe('yawForIndex', () => {
  const step = 360 / 14

  it('목표 패널이 정면에 오는 yaw를 준다', () => {
    const y = yawForIndex(0, 14, 5)
    expect(activeIndex(14, y)).toBe(5)
  })

  it('최단 방향으로 간다 — 13번은 뒤로 한 칸', () => {
    expect(yawForIndex(0, 14, 13)).toBeCloseTo(-step)
  })

  it('누적 회전을 풀지 않는다', () => {
    // yaw 720(두 바퀴)에서 1번 패널로 가면 745.7 근처여야지 25.7로 돌아가면 안 된다.
    const y = yawForIndex(720, 14, 1)
    expect(y).toBeCloseTo(720 + step)
  })

  it('이미 정면이면 그대로 둔다', () => {
    expect(yawForIndex(step * 3, 14, 3)).toBeCloseTo(step * 3)
  })
})

describe('panelGeometry', () => {
  it('패널이 겹치지 않을 만큼 반지름을 잡는다', () => {
    for (const vw of [360, 768, 1440, 2560]) {
      const g = panelGeometry(vw, 14)
      // 원주가 패널 14개 폭보다 넉넉히 커야 한다
      expect(2 * Math.PI * g.radius).toBeGreaterThan(14 * g.width)
    }
  })

  it('뷰포트가 커지면 패널도 커지되 상한이 있다', () => {
    expect(panelGeometry(1440, 14).width).toBeGreaterThan(panelGeometry(360, 14).width)
    expect(panelGeometry(4000, 14).width).toBe(panelGeometry(3000, 14).width)
  })

  it('가로세로비와 원근 거리를 함께 돌려준다', () => {
    const g = panelGeometry(1440, 14)
    expect(g.height).toBeCloseTo(g.width * 0.62, 0)
    expect(g.perspective).toBeGreaterThan(g.radius)
  })
})

describe('isDragGesture', () => {
  it('문턱 안의 미세한 흔들림은 클릭으로 남는다', () => {
    expect(isDragGesture(100, 100, 100, 100)).toBe(false)
    expect(isDragGesture(100, 100, 104, 100)).toBe(false)
    expect(isDragGesture(100, 100, 100, 104)).toBe(false)
  })

  it('문턱을 넘으면 드래그다 — 축이 아닌 방향도 포함', () => {
    expect(isDragGesture(100, 100, 110, 100)).toBe(true)
    expect(isDragGesture(100, 100, 100, 110)).toBe(true)
    expect(isDragGesture(100, 100, 90, 90)).toBe(true)
  })

  it('부드러운 포인터 스트림에서도 누적 이동을 잡아낸다', () => {
    // 실기기는 이벤트당 1px 미만으로 움직인다. 직전 이벤트와의 델타로 재면
    // 300px를 끌어도 영영 문턱을 넘지 못한다 — 기준점은 시작점이어야 한다.
    const startX = 500
    let x = startX
    let dragged = false
    for (let i = 0; i < 600; i++) {
      x += 0.5
      dragged = dragged || isDragGesture(startX, 300, x, 300)
    }
    expect(x - startX).toBe(300)
    expect(dragged).toBe(true)
  })
})
