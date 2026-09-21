import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'

// All assets are redistributable and same-origin; see /skybound/ATTRIBUTION.md.
// Each upgrade is independent. The procedural scene stays playable on failure.
export function loadFlightAssets({ scene, renderer, own, isDisposed, invalidate, aircraft, fallback, sky, clouds, terrainMaterial, waterMaterial }) {
  const status = { aircraft: 'loading', lighting: 'loading', terrain: 'loading' }
  const textureLoader = new THREE.TextureLoader()
  const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
  // Upload at most one texture per frame. Letting the first visible render
  // upload all six terrain maps at once creates a noticeable driver stall.
  const uploads = []
  let uploadFrame = 0
  function uploadNext() {
    uploadFrame = 0
    const { map, resolve, reject } = uploads.shift()
    try { if (!isDisposed()) renderer.initTexture(map); resolve() }
    catch (error) { reject(error) }
    if (uploads.length) uploadFrame = requestAnimationFrame(uploadNext)
  }
  function upload(map) {
    if (isDisposed()) return Promise.resolve()
    return new Promise((resolve, reject) => {
      uploads.push({ map, resolve, reject })
      if (!uploadFrame) uploadFrame = requestAnimationFrame(uploadNext)
    })
  }
  own({ dispose() { cancelAnimationFrame(uploadFrame); uploadFrame = 0; uploads.splice(0).forEach(({ resolve }) => resolve()) } })
  function texture(url, color = false) {
    return textureLoader.loadAsync(`/skybound/${url}`).then(async (map) => {
      own(map)
      map.wrapS = map.wrapT = THREE.RepeatWrapping
      map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace
      map.anisotropy = anisotropy
      await upload(map)
      return map
    })
  }
  function upgrade(key, load) {
    load().then(() => {
      if (!isDisposed()) { status[key] = 'ready'; invalidate() }
    }).catch(() => {
      if (!isDisposed()) { status[key] = 'fallback'; invalidate() }
    })
  }
  upgrade('aircraft', async () => {
    const gltf = await new GLTFLoader().loadAsync('/skybound/c172.glb')
    const model = gltf.scene
    const textures = new Set()
    model.traverse((object) => {
      if (!object.isMesh) return
      own(object.geometry)
      object.castShadow = true
      object.receiveShadow = true
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        own(material)
        material.ior = 1.46
        material.roughness = Math.max(material.roughness, .45)
        material.envMapIntensity = .8
        // The source's grayscale paint contains very dark baked shading. Keep
        // its detail, but lift it before applying the scene's physical lighting.
        material.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace(
            'diffuseColor *= sampledDiffuseColor;',
            'sampledDiffuseColor.rgb = pow(sampledDiffuseColor.rgb, vec3(.45)); diffuseColor *= sampledDiffuseColor;',
          ))
        }
        material.customProgramCacheKey = () => 'skybound-aircraft-paint-v1'
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value)
      }
    })
    for (const map of textures) {
      own(map)
      own({ dispose: () => map.source.data?.close?.() })
      map.anisotropy = anisotropy
    }
    await Promise.all([...textures].map(upload))
    if (isDisposed()) return
    // The redistributed model is Y-up, with its nose along -X. Game forward is -Z.
    model.rotation.y = -Math.PI / 2
    model.scale.setScalar(1.2)
    model.name = 'cessna-172'
    aircraft.add(model)
    fallback.visible = false
  })
  upgrade('lighting', async () => {
    const hdr = own(await new HDRLoader().loadAsync('/skybound/sky.hdr'))
    await upload(hdr)
    if (isDisposed()) return
    hdr.mapping = THREE.EquirectangularReflectionMapping
    scene.environment = hdr
    scene.environmentIntensity = .65
    waterMaterial.uniforms.uSky.value = hdr
    waterMaterial.uniforms.uHasSky.value = true
    // Fade the photographed sky into the same haze as the sea, avoiding a hard
    // seam where the finite water plane meets the panorama's horizon.
    sky.material = own(new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { sbSky: { value: hdr } },
      vertexShader: 'varying vec3 vDirection; void main(){ vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `uniform sampler2D sbSky; varying vec3 vDirection;
        #include <common>
        void main() {
          vec3 direction = normalize(vDirection);
          gl_FragColor = vec4(texture2D(sbSky, equirectUv(direction)).rgb * .85, 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          gl_FragColor.rgb = mix(vec3(.784, .875, .882), gl_FragColor.rgb, smoothstep(0., .2, direction.y));
        }`,
    }))
    clouds.visible = false
  })
  upgrade('terrain', async () => {
    const [sand, sandNormal, sandRough, grass, grassNormal, grassRough] = await Promise.all([
      texture('sand-color.jpg', true), texture('sand-normal.jpg'), texture('sand-rough.jpg'),
      texture('grass-color.jpg', true), texture('grass-normal.jpg'), texture('grass-rough.jpg'),
    ])
    if (isDisposed()) return
    terrainMaterial.map = sand
    terrainMaterial.normalMap = sandNormal
    terrainMaterial.normalScale.set(.65, .65)
    sandNormal.repeat.setScalar(.24)
    sandRough.repeat.setScalar(.24)
    terrainMaterial.roughnessMap = sandRough
    terrainMaterial.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        sbGrass: { value: grass }, sbGrassNormal: { value: grassNormal }, sbGrassRough: { value: grassRough },
      })
      shader.vertexShader = `varying float vSbHeight;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSbHeight = position.y;')
      shader.fragmentShader = `varying float vSbHeight;
        uniform sampler2D sbGrass; uniform sampler2D sbGrassNormal; uniform sampler2D sbGrassRough;
        ${shader.fragmentShader}`
        .replace('#include <map_fragment>', `
          float sbLandMix = smoothstep(5.0, 24.0, vSbHeight);
          vec3 sbSand = mix(texture2D(map, vMapUv * .24).rgb, texture2D(map, -vMapUv * .13 + .37).rgb, .45);
          vec3 sbGrassColor = mix(texture2D(sbGrass, vMapUv * .24).rgb, texture2D(sbGrass, -vMapUv * .13 + .37).rgb, .45);
          vec3 sbColor = mix(sbSand, sbGrassColor, sbLandMix);
          sbColor = mix(sbColor, vec3(.82), smoothstep(250., 520., vSbHeight));
          sbColor = mix(sbColor, vec3(1.), smoothstep(520., 620., vSbHeight));
          diffuseColor.rgb *= sbColor;
        `)
        .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replaceAll(
          'texture2D( normalMap, vNormalMapUv ).xyz',
          'mix(texture2D(normalMap, vNormalMapUv).xyz, texture2D(sbGrassNormal, vNormalMapUv).xyz, sbLandMix)',
        ))
        .replace('#include <roughnessmap_fragment>', `
          float roughnessFactor = roughness * mix(texture2D(roughnessMap, vRoughnessMapUv).g, texture2D(sbGrassRough, vRoughnessMapUv).g, sbLandMix);
        `)
    }
    terrainMaterial.customProgramCacheKey = () => 'skybound-biomes-pbr-v2'
    terrainMaterial.needsUpdate = true
  })
  return status
}
