import * as THREE from 'three'

// 건물 표면과 도로면의 셰이딩. 커스텀 ShaderMaterial 대신 three의
// MeshStandardMaterial에 코드를 주입한다 — 그림자, 환경광(IBL), PBR 반사가
// 전부 three의 파이프라인에서 따라오기 때문이다. 직접 램버트를 계산하던
// 방식으로는 이 셋 중 어느 것도 얻을 수 없었다.

export const FLOOR_H = 3.2   // 층고. 실내 매핑이 들어가면 창이 어느 정도 커야
export const WINDOW_W = 2.4  // 방이 보인다 — 사람 키 기준의 실제 층고에 맞췄다.

// 기준층 창 개구부(프레임 안쪽). 실내 매핑은 이 범위를 방의 정면으로 삼는다.
const PANE_MIN = [0.16, 0.28]
const PANE_MAX = [0.84, 0.86]

const COMMON = /* glsl */ `
  float fcHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
`

// 대기 원근. 균일한 지수 안개는 "거리"만 표현한다. 실제로 위에서 내려다본
// 도시는 (1) 연무가 지면 가까이 쌓여 있어 낮은 층일수록 흐리고, (2) 해를
// 바라보는 쪽의 안개가 전방 산란으로 밝게 빛난다. 이 둘이 깊이를 만든다.
const FOG_PARS = /* glsl */ `
  uniform vec3 uHazeColor;
  uniform vec3 uHazeSun;
  uniform vec3 uSunDirF;
  uniform float uHazeDensity;
  uniform float uHazeFalloff;

  vec3 applyAerial(vec3 color, vec3 worldPos) {
    vec3 toFrag = worldPos - cameraPosition;
    float dist = length(toFrag);
    float h = exp(-max(worldPos.y, 0.0) * uHazeFalloff);
    float f = 1.0 - exp(-dist * uHazeDensity * h);
    float sunAmount = max(dot(normalize(toFrag), uSunDirF), 0.0);
    vec3 hazeCol = mix(uHazeColor, uHazeSun, pow(sunAmount, 5.0));
    return mix(color, hazeCol, clamp(f, 0.0, 1.0));
  }
`

const FACADE_VERT_PARS = /* glsl */ `
  attribute vec3 aScale;
  attribute float aSeed;
  attribute float aTint;
  varying vec3 vLocalPos;
  varying vec3 vScaleV;
  varying vec3 vWorldPosF;
  varying vec3 vObjNrm;
  varying float vSeedV;
  varying float vTintV;
`

const FACADE_VERT_BODY = /* glsl */ `
  // 인스턴스 행렬이 스케일을 들고 있으므로, 벽면 좌표는 단위 박스 좌표에
  // 스케일을 곱해 월드 단위로 되돌려 쓴다.
  vLocalPos = position * aScale;
  vScaleV = aScale;
  vSeedV = aSeed;
  vTintV = aTint;
  // 축 정렬 박스라 오브젝트 법선이 곧 월드 법선이다 (면 판정용).
  vObjNrm = normal;
  vWorldPosF = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
`

const FACADE_FRAG_PARS = /* glsl */ `
  uniform float uNight;
  uniform float uTimeF;
  uniform vec3 uWindowWarm;
  uniform vec3 uWindowCool;
  uniform vec3 uRoomBack;
  uniform vec3 uRoomSide;
  uniform vec3 uRoomFloor;
  uniform vec3 uRoomCeil;
  uniform float uInteriorDepth;

  varying vec3 vLocalPos;
  varying vec3 vScaleV;
  varying vec3 vWorldPosF;
  varying vec3 vObjNrm;
  varying float vSeedV;
  varying float vTintV;

  ${COMMON}
  ${FOG_PARS}
`

// 파사드 문법. 실제 건물은 모든 층이 같지 않다 — 저층부는 상가, 최상층은
// 설비층, 세로로는 멀리언이 창을 묶고, 모서리에는 창 대신 기둥이 선다.
// 균일한 창 격자를 깨는 이 규칙들이 "타일을 붙인 상자"와 "건물"을 가른다.
const FACADE_FRAG_COLOR = /* glsl */ `
  vec3 fNrm = normalize(vObjNrm);
  float fRoof = step(0.5, abs(fNrm.y));
  float fWallU = abs(fNrm.x) > 0.5 ? vLocalPos.z : vLocalPos.x;
  float fWallV = vLocalPos.y + vScaleV.y * 0.5;
  float fHalfU = abs(fNrm.x) > 0.5 ? vScaleV.z * 0.5 : vScaleV.x * 0.5;
  float fFloors = floor(vScaleV.y / ${FLOOR_H.toFixed(2)});

  vec2 fCell = vec2(floor(fWallU / ${WINDOW_W.toFixed(2)}), floor(fWallV / ${FLOOR_H.toFixed(2)}));
  vec2 fFrac = vec2(fract(fWallU / ${WINDOW_W.toFixed(2)}), fract(fWallV / ${FLOOR_H.toFixed(2)}));
  vec2 fWin = fCell + vec2(vSeedV, vSeedV * 1.7);

  // ── 건물별 문법: 멀리언 간격, 설비층 유무, 유리동 여부
  float fMullEvery = 2.0 + floor(fcHash(vec2(vSeedV, 1.3)) * 2.0);
  float fMullOn = step(0.42, fcHash(vec2(vSeedV, 2.7)));
  float fIsMullion = fMullOn * (1.0 - step(0.5, mod(abs(fCell.x), fMullEvery)));
  float fIsTower = step(0.76, vTintV);
  // 설비층: 층수가 어느 정도 되는 건물의 최상층. 창 대신 루버가 달린다.
  float fIsMech = step(0.62, fcHash(vec2(vSeedV, 4.9))) * step(7.0, fFloors)
                * step(fFloors - 1.5, fCell.y);
  // 저층부: 1층은 상가라 개구부가 크고 층고가 다르게 읽힌다.
  float fIsGround = 1.0 - step(0.5, fCell.y);

  // 모서리에는 창이 없다 — 실제 건물의 모서리는 기둥이다. 이 한 줄이 상자에
  // 창을 도배한 느낌을 가장 크게 줄인다.
  float fCorner = smoothstep(fHalfU - 1.0, fHalfU - 0.25, abs(fWallU));
  // 최상단은 파라펫·캡 — 창이 옥상 선에 반쯤 걸리지 않게 한다.
  float fTopBand = smoothstep(vScaleV.y - ${FLOOR_H.toFixed(2)} * 0.5,
                              vScaleV.y - ${FLOOR_H.toFixed(2)} * 0.12, fWallV);

  vec2 PANE0 = mix(vec2(${PANE_MIN[0]}, ${PANE_MIN[1]}), vec2(0.07, 0.10), fIsGround);
  vec2 PANE1 = mix(vec2(${PANE_MAX[0]}, ${PANE_MAX[1]}), vec2(0.93, 0.78), fIsGround);

  float fPane = step(PANE0.x, fFrac.x) * step(fFrac.x, PANE1.x)
              * step(PANE0.y, fFrac.y) * step(fFrac.y, PANE1.y);
  fPane *= (1.0 - fRoof) * (1.0 - fIsMullion) * (1.0 - fCorner) * (1.0 - fTopBand);

  // ── 실내 매핑: 창 뒤에 실제 방이 있는 것처럼 광선을 상자와 교차시킨다.
  // 지오메트리를 하나도 늘리지 않고 시점에 따라 방이 어긋나 보이는 것이
  // 핵심이다 — 평면에 그린 창은 아무리 칠해도 스티커로 읽힌다.
  vec2 fPaneUV = clamp((fFrac - PANE0) / (PANE1 - PANE0), 0.0, 1.0);
  vec3 fUAxis = abs(fNrm.x) > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 fRay = normalize(vWorldPosF - cameraPosition);
  vec3 fDir = vec3(dot(fRay, fUAxis), fRay.y, dot(fRay, -fNrm));

  vec2 fRoom = vec2((PANE1.x - PANE0.x) * ${WINDOW_W.toFixed(2)},
                    (PANE1.y - PANE0.y) * ${FLOOR_H.toFixed(2)});
  vec3 fEntry = vec3(fPaneUV.x * fRoom.x, fPaneUV.y * fRoom.y, 0.0);

  float fTW = fDir.z > 1e-4 ? uInteriorDepth / fDir.z : 1e9;
  float fTU = fDir.x > 1e-4 ? (fRoom.x - fEntry.x) / fDir.x
            : (fDir.x < -1e-4 ? -fEntry.x / fDir.x : 1e9);
  float fTV = fDir.y > 1e-4 ? (fRoom.y - fEntry.y) / fDir.y
            : (fDir.y < -1e-4 ? -fEntry.y / fDir.y : 1e9);
  float fT = min(fTW, min(fTU, fTV));
  vec3 fHit = fEntry + fDir * fT;

  vec3 fRoomCol = uRoomBack;
  float fLamp = 0.0;
  if (fT == fTU) {
    fRoomCol = uRoomSide;
  } else if (fT == fTV) {
    fRoomCol = fDir.y > 0.0 ? uRoomCeil : uRoomFloor;
    if (fDir.y > 0.0) {
      // 천장 조명 한 점 — 방이 스스로 밝은 게 아니라 조명이 있다는 신호.
      vec2 fc = vec2(fHit.x / fRoom.x, fHit.z / uInteriorDepth);
      fLamp = smoothstep(0.38, 0.0, distance(fc, vec2(0.5, 0.58)));
    }
  }
  // 깊이가 깊을수록 어두워진다.
  fRoomCol *= 1.0 - 0.6 * clamp(fT / uInteriorDepth, 0.0, 1.0);

  // ── 창별 상태: 켜짐/꺼짐, 색온도, 밝기, 아주 일부만 느린 점멸.
  float fH = fcHash(fWin);
  float fLit = step(0.55, fH);
  float fWarm = step(0.86, fcHash(fWin * 1.7));
  vec3 fLampCol = mix(uWindowWarm, uWindowCool, fWarm);
  float fBright = 0.45 + 0.55 * fcHash(fWin * 3.3);
  float fBlink = 0.6 + 0.4 * sin(uTimeF * 1.7 + fH * 90.0);
  fLit *= fBright * mix(1.0, fBlink, step(0.975, fH));
  fLit = max(fLit, fIsGround * 0.9);   // 상가는 밤에도 켜져 있다
  fLit *= 1.0 - fIsMech;               // 설비층에는 사람이 없다

  // ── 벽: 재질 계열 3종. 도시가 한 가지 색으로만 서 있으면 같은 건물을
  // 복사한 것으로 읽힌다.
  vec3 fFamily = vTintV < 0.40 ? vec3(0.74, 0.73, 0.70)      // 콘크리트
               : (vTintV < 0.76 ? vec3(0.82, 0.74, 0.63)     // 석재·도장
                                : vec3(0.50, 0.54, 0.60));   // 유리동 스팬드럴
  vec3 fWall = diffuseColor.rgb * fFamily * (0.86 + fcHash(vec2(vSeedV, 3.7)) * 0.3);
  // 하부에 때가 앉는다. 실제 건물이 위아래로 같은 색인 경우는 없다.
  fWall *= 0.72 + 0.28 * smoothstep(0.0, 14.0, fWallV);
  // 지붕은 방수층 — 벽보다 어둡고 거칠다.
  fWall = mix(fWall, fWall * 0.55, fRoof);
  // 유리동은 창 아래 띠(스팬드럴)가 짙은 유리 패널이라 통유리처럼 읽힌다.
  float fSpandrel = fIsTower * step(fFrac.y, PANE0.y) * (1.0 - fRoof)
                  * (1.0 - fIsMullion) * (1.0 - fCorner);
  fWall = mix(fWall, vec3(0.09, 0.11, 0.14), fSpandrel * 0.85);
  // 저층부 상단의 캐노피 선 — 상가와 기준층의 경계를 눈에 보이게 한다.
  float fCanopy = step(1.0, fCell.y) * (1.0 - step(2.0, fCell.y))
                * step(fFrac.y, 0.12) * (1.0 - fRoof);
  fWall = mix(fWall, fWall * 0.45, fCanopy);

  // ── 창: 착색 반사 유리. 낮에는 하늘 반사가, 밤에는 실내 발광이 이기는데
  // 그 전환이 저절로 일어난다 — 실제 건물이 그렇게 보이는 이유와 같다.
  vec3 fGlass = vec3(0.17, 0.20, 0.25) * (0.75 + fcHash(fWin * 0.7) * 0.5);

  // 블라인드: 창의 일부를 위에서부터 가린다. 내린 정도가 창마다 달라야
  // 파사드가 격자가 아니라 사람이 쓰는 건물로 읽힌다.
  float fHasBlind = step(0.58, fcHash(fWin * 5.1)) * (1.0 - fIsGround);
  float fDrop = 0.2 + 0.7 * fcHash(fWin * 7.3);
  float fBlind = fHasBlind * step(1.0 - fDrop, fPaneUV.y);
  vec3 fBlindCol = vec3(0.52, 0.50, 0.47) * (0.8 + fcHash(fWin * 9.7) * 0.4);

  // 설비층 루버: 가로 날개가 겹친 환기구. 빛도 반사도 거의 없다.
  float fLouver = fIsMech * step(0.45, fract(fPaneUV.y * 5.0));
  vec3 fLouverCol = vec3(0.20, 0.21, 0.23);

  vec3 fPaneCol = mix(mix(fGlass, fBlindCol, fBlind), fLouverCol, fIsMech);
  fPaneCol = mix(fPaneCol, fLouverCol * 0.55, fLouver);
  diffuseColor.rgb = mix(fWall, fPaneCol, fPane);
`

const FACADE_FRAG_ROUGH = /* glsl */ `
  // 유리도 창마다 조금씩 다르게 — 완전히 같은 거칠기는 현실에 없다.
  float fGlassRough = 0.05 + fcHash(fWin * 11.3) * 0.09;
  float fPaneRough = mix(mix(fGlassRough, 0.88, fBlind), 0.72, fIsMech);
  roughnessFactor = mix(mix(0.92, 0.98, fRoof), fPaneRough, fPane);
`

const FACADE_FRAG_METAL = /* glsl */ `
  // 유리를 반금속으로 두면 환경맵(절차적 하늘)이 그대로 반사된다 —
  // 현대 건물이 건물로 보이는 단서의 대부분이 이 반사다.
  float fPaneMetal = mix(mix(0.88, 0.0, fBlind), 0.35, fIsMech);
  metalnessFactor = mix(0.02, fPaneMetal, fPane);
`

const FACADE_FRAG_EMISSIVE = /* glsl */ `
  vec3 fInterior = fRoomCol + fLampCol * fLamp * 1.8;
  // 블라인드 뒤의 빛은 천으로 걸러져 번진다 — 방이 그대로 보이지 않는다.
  vec3 fLightOut = mix(fInterior, fBlindCol * fLampCol * 1.6, fBlind);
  // 밤에는 켜진 방이 빛나고, 낮에는 실내가 아주 옅게만 비친다.
  totalEmissiveRadiance += fPane * (1.0 - fIsMech) * (
    fLightOut * fLit * uNight * 1.5
    + fInterior * (1.0 - fBlind) * (1.0 - uNight) * 0.18
  );
`

/**
 * 건물 재질에 파사드 셰이딩을 주입한다. 재질은 MeshStandardMaterial이어야
 * 그림자·IBL·PBR이 함께 동작한다.
 */
export function patchFacade(material, uniforms) {
  material.fog = false // 대기 원근을 직접 계산한다 (applyAerial)
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FACADE_VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${FACADE_VERT_BODY}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FACADE_FRAG_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FACADE_FRAG_COLOR}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FACADE_FRAG_ROUGH}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${FACADE_FRAG_METAL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FACADE_FRAG_EMISSIVE}`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        gl_FragColor.rgb = applyAerial(gl_FragColor.rgb, vWorldPosF);`)
  }
  // 주입한 셰이더가 기본 재질과 섞이지 않도록 캐시 키를 분리한다.
  material.customProgramCacheKey = () => 'procedural-city-facade'
  return material
}

/**
 * 도로면. 그림자를 받아야 하므로 이쪽도 표준 재질에 주입한다 —
 * 거리에 드리우는 긴 그림자가 항공 시점에서 가장 강한 현실 단서다.
 */
export function patchGround(material, uniforms, { block, roadW, half }) {
  material.fog = false
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n  varying vec3 vGroundPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vGroundPos = (modelMatrix * vec4(position, 1.0)).xyz;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight;
        uniform vec3 uAsphalt;
        uniform vec3 uPlaza;
        uniform vec3 uLine;
        uniform vec3 uLampGlow;
        varying vec3 vGroundPos;
        ${COMMON}
        ${FOG_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        const float BLOCK = ${block.toFixed(1)};
        const float ROAD_W = ${roadW.toFixed(1)};
        vec2 gG = mod(vGroundPos.xz + ${half.toFixed(1)}, BLOCK);
        float gDX = min(gG.x, BLOCK - gG.x);
        float gDZ = min(gG.y, BLOCK - gG.y);
        float gRoad = 1.0 - smoothstep(ROAD_W * 0.5 - 1.2, ROAD_W * 0.5 + 0.4, min(gDX, gDZ));
        float gCurb = smoothstep(ROAD_W * 0.5 - 1.4, ROAD_W * 0.5 - 0.2, min(gDX, gDZ))
                    * (1.0 - smoothstep(ROAD_W * 0.5 + 0.6, ROAD_W * 0.5 + 2.0, min(gDX, gDZ)));
        vec3 gCol = mix(uPlaza, uAsphalt, gRoad);
        gCol = mix(gCol, uPlaza * 1.35, gCurb * 0.7);
        float gAlong = step(gDZ, gDX) > 0.5 ? vGroundPos.x : vGroundPos.z;
        float gDash = step(0.55, fract(gAlong / 9.0));
        float gCenter = (1.0 - smoothstep(0.0, 0.55, min(gDX, gDZ))) * gDash * gRoad;
        float gCross = step(min(gDX, gDZ), ROAD_W * 0.5) * step(max(gDX, gDZ), ROAD_W * 0.5);
        gCol = mix(gCol, uLine, gCenter * (1.0 - gCross) * 0.75);
        // 노면 얼룩 — 균일한 아스팔트는 렌더처럼 보인다.
        gCol *= 0.88 + 0.24 * fcHash(floor(vGroundPos.xz * 0.35));
        diffuseColor.rgb = gCol;
        float gRoadMask = gRoad;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        // 아스팔트는 밤에 살짝 젖은 듯 매끄러워져 빛을 되비친다.
        roughnessFactor = mix(0.95, mix(0.62, 0.34, uNight), gRoadMask);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float gAlongL = step(gDZ, gDX) > 0.5 ? vGroundPos.x : vGroundPos.z;
        float gLamp = pow(sin(gAlongL * 0.46) * 0.5 + 0.5, 7.0);
        totalEmissiveRadiance += uLampGlow * gRoadMask * uNight * (0.02 + 0.5 * gLamp);`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        gl_FragColor.rgb = applyAerial(gl_FragColor.rgb, vGroundPos);`)
  }
  material.customProgramCacheKey = () => 'procedural-city-ground'
  return material
}

/** 낮/밤 팔레트를 한 곳에 모아 둔다 — 색이 흩어지면 톤을 맞추기 어렵다. */
export const PALETTE = {
  day: {
    horizon: new THREE.Color('#c3d2e2'), zenith: new THREE.Color('#5f86bf'),
    haze: new THREE.Color('#a9bccf'), hazeSun: new THREE.Color('#ffe0b8'),
    sun: new THREE.Color('#fff3dd'),
    wall: new THREE.Color('#b9b3a6'), asphalt: new THREE.Color('#31353b'),
    plaza: new THREE.Color('#5f636a'), lamp: new THREE.Color('#000000'),
    room: new THREE.Color('#6b6a66'),
  },
  night: {
    horizon: new THREE.Color('#2b3550'), zenith: new THREE.Color('#070b16'),
    haze: new THREE.Color('#161d2c'), hazeSun: new THREE.Color('#2e3648'),
    sun: new THREE.Color('#2a3550'),
    wall: new THREE.Color('#4a4d55'), asphalt: new THREE.Color('#15181f'),
    plaza: new THREE.Color('#1e222a'), lamp: new THREE.Color('#5c4520'),
    room: new THREE.Color('#c8a173'),
  },
}
