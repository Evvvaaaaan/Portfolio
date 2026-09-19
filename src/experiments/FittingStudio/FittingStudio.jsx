import { useEffect, useRef, useState } from 'react'
import { useLang } from '../../context/LangContext'
import { createFittingScene } from './scene.js'
import { OUTFITS } from './model.js'
import { ERROR_COPY, MAX_MODEL_BYTES, fittingRequest, readImage, validateGlb } from './files.js'
import './FittingStudio.css'

function UploadCard({ label, image, onChange, disabled, type }) {
  return <label className={`fs-upload${image ? ' has-image' : ''}`}>
    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onChange} disabled={disabled} aria-label={label} />
    {image ? <img src={image.data} alt={image.name} /> : <svg viewBox="0 0 70 80" fill="none" aria-hidden="true">
      {type === 'person' ? <><circle cx="35" cy="15" r="9" /><path d="M22 36q13-17 26 0l7 19M22 36l-7 19M26 34l-3 36M44 34l3 36M35 49v23" /></> : <path d="m24 15-15 9 8 18 9-4v32h20V38l9 4 8-18-16-9q-11 13-23 0Z" />}
    </svg>}
    <span className="fs-upload-plus">{image ? '↺' : '+'}</span><span className="fs-upload-label">{label}</span>
  </label>
}

export default function FittingStudio() {
  const { lang, setLang } = useLang()
  const ko = lang === 'ko'
  const text = (korean, english) => ko ? korean : english
  const hostRef = useRef(null), apiRef = useRef(null), tokenRef = useRef(null)
  const alive = useRef(true), urls = useRef(new Set()), jobIds = useRef(new Set())
  const [person, setPerson] = useState(null), [garment, setGarment] = useState(null)
  const [connected, setConnected] = useState(null), [consent, setConsent] = useState(false)
  const [pending, setPending] = useState(null), [pollNonce, setPollNonce] = useState(0), [interrupted, setInterrupted] = useState(false)
  const [look, setLook] = useState(null), [reviewed, setReviewed] = useState(false)
  const [models, setModels] = useState([]), [selected, setSelected] = useState('demo')
  const [outfit, setOutfit] = useState('jacket'), [color, setColor] = useState(OUTFITS[0].color)
  const [rotate, setRotate] = useState(false), [wireframe, setWireframe] = useState(false), [light, setLight] = useState('studio')
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [activePanel, setActivePanel] = useState('photos')
  const [glReady, setGlReady] = useState(false)
  const busy = Boolean(pending) || loading
  const demo = selected === 'demo'

  useEffect(() => {
    alive.current = true
    const host = hostRef.current
    let scene
    try { scene = createFittingScene(host); apiRef.current = scene }
    catch { queueMicrotask(() => { if (alive.current) setError('WEBGL') }); return }
    queueMicrotask(() => { if (alive.current) setGlReady(true) })
    const onLost = (e) => { e.preventDefault(); setError('WEBGL'); setGlReady(false) }
    const canvas = host.querySelector('canvas')
    canvas.addEventListener('webglcontextlost', onLost)
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMotion = (e) => { if (e.matches) { scene.rotate(false); setRotate(false) } }
    media.addEventListener('change', onMotion)
    const onVisibility = () => { if (document.hidden) { scene.rotate(false); setRotate(false) } }
    document.addEventListener('visibilitychange', onVisibility)
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('debug')) window.__fitting = { state: scene.getState }
    const currentUrls = urls.current
    return () => {
      alive.current = false
      canvas.removeEventListener('webglcontextlost', onLost)
      media.removeEventListener('change', onMotion)
      document.removeEventListener('visibilitychange', onVisibility)
      scene.dispose()
      apiRef.current = null
      currentUrls.forEach((url) => URL.revokeObjectURL(url))
      currentUrls.clear()
      delete window.__fitting
    }
  }, [])

  useEffect(() => {
    const abort = new AbortController()
    fittingRequest('/status', { signal: abort.signal }).then((result) => {
      tokenRef.current = result.token
      setConnected(Boolean(result.available))
    }).catch(() => { if (!abort.signal.aborted) setConnected(false) })
    return () => abort.abort()
  }, [])

  useEffect(() => {
    if (!pending) return
    const abort = new AbortController()
    let timer
    const poll = async () => {
      try {
        const result = await fittingRequest(`/jobs/${pending.id}`, { token: tokenRef.current, signal: abort.signal })
        if (result.status === 'running') { timer = setTimeout(poll, 2500); return }
        if (result.status !== 'complete') { setError(result.error || 'GENERATION_FAILED'); setPending(null); return }
        const blob = await fittingRequest(`/jobs/${pending.id}/asset`, { token: tokenRef.current, signal: abort.signal, asset: true })
        if (abort.signal.aborted) return
        if (pending.kind === 'look') {
          const url = URL.createObjectURL(blob)
          urls.current.add(url)
          setLook({ id: pending.id, url })
          setReviewed(false)
          setActivePanel('photos')
        } else {
          const buffer = await blob.arrayBuffer()
          validateGlb(buffer)
          if (abort.signal.aborted) return
          const loaded = await apiRef.current?.load(buffer)
          if (!loaded || abort.signal.aborted) return
          setModels((previous) => [...previous, { id: pending.id, kind: pending.kind, buffer }])
          setSelected(pending.id)
        }
        setPending(null)
      } catch (e) {
        if (abort.signal.aborted) return
        setError(e.message in ERROR_COPY.en ? e.message : 'CONNECTION_FAILED')
        if (['INVALID_MODEL', 'MODEL_SIZE', 'MODEL_TOO_LARGE', 'EXTERNAL_MODEL_RESOURCE', 'SOURCE_EXPIRED'].includes(e.message)) setPending(null)
        else setInterrupted(true)
      }
    }
    poll()
    return () => { abort.abort(); clearTimeout(timer) }
  }, [pending, pollNonce])

  async function upload(event, kind) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy) return
    setError('')
    setLoading(true)
    try {
      const image = await readImage(file)
      if (!alive.current) return
      if (kind === 'person') {
        setPerson(image)
        setModels([])
        setSelected('demo')
        apiRef.current?.demo(outfit, color)
      } else setGarment(image)
      setLook(null)
      setReviewed(false)
      setConsent(false)
    } catch (e) { if (alive.current) setError(e.message in ERROR_COPY.en ? e.message : 'INVALID_IMAGE') }
    finally { if (alive.current) setLoading(false) }
  }

  async function generate(kind) {
    if (busy || !connected || !consent || !person || (kind === 'look' && !garment) || (kind === 'mesh' && (!look || !reviewed))) return
    setError('')
    setLoading(true)
    setInterrupted(false)
    try {
      const result = await fittingRequest('/jobs', { token: tokenRef.current, body: {
        kind, consent: true, ...(kind !== 'mesh' ? { person } : { sourceId: look.id, reviewed: true }), ...(kind === 'look' ? { garment } : {}),
      } })
      jobIds.current.add(result.id)
      if (alive.current) setPending(result)
    } catch (e) { if (alive.current) setError(e.message in ERROR_COPY.en ? e.message : 'CONNECTION_FAILED') }
    finally { if (alive.current) setLoading(false) }
  }

  async function selectModel(id) {
    if (loading || !glReady) return
    setError('')
    if (id === 'demo') { apiRef.current?.demo(outfit, color); setSelected('demo'); return }
    const model = models.find((m) => m.id === id)
    if (!model) return
    setLoading(true)
    try { if (await apiRef.current?.load(model.buffer)) setSelected(id) }
    catch (e) { if (alive.current) setError(e.message in ERROR_COPY.en ? e.message : 'INVALID_MODEL') }
    finally { if (alive.current) setLoading(false) }
  }

  async function importModel(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy) return
    setError('')
    setLoading(true)
    try {
      if (file.size > MAX_MODEL_BYTES) throw new Error('MODEL_SIZE')
      const buffer = await file.arrayBuffer()
      validateGlb(buffer)
      if (!alive.current || !await apiRef.current?.load(buffer)) return
      const id = `import-${crypto.randomUUID()}`
      setModels((previous) => [...previous, { id, buffer, kind: 'import', name: file.name }])
      setSelected(id)
    } catch (e) { if (alive.current) setError(e.message in ERROR_COPY.en ? e.message : 'INVALID_MODEL') }
    finally { if (alive.current) setLoading(false) }
  }

  function save(blob, name) {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = name; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  function reset() {
    if (busy) return
    for (const id of jobIds.current) fittingRequest(`/jobs/${id}`, { token: tokenRef.current, method: 'DELETE' }).catch(() => {})
    jobIds.current.clear()
    urls.current.forEach((url) => URL.revokeObjectURL(url)); urls.current.clear()
    setPerson(null); setGarment(null); setLook(null); setReviewed(false); setConsent(false); setModels([]); setSelected('demo'); setError('')
    apiRef.current?.demo(outfit, color)
  }
  const currentModel = models.find((m) => m.id === selected)
  const jobLabel = pending?.kind === 'look' ? text('착장 이미지를 생성하고 있습니다', 'Creating your outfit preview') : text('사진으로 3D 모델을 만들고 있습니다', 'Reconstructing a 3D model from your photo')

  return <main className="fitting-studio" data-source={demo ? 'demo' : currentModel?.kind === 'import' ? 'import' : 'generated'}>
    <header className="fs-header">
      <div className="fs-brand"><strong>Fitting<span>Atelier.</span></strong><span>EVAN LAB / EXPERIMENT 021</span></div>
      <div className="fs-header-right"><span className="fs-local"><i className={connected ? 'online' : ''} />{connected === null ? text('연결 확인 중', 'Connecting') : connected ? text('로컬 CLI 사용 가능', 'LOCAL CLI AVAILABLE') : text('뷰어 모드', 'VIEWER MODE')}</span><button type="button" onClick={() => setLang(ko ? 'en' : 'ko')}>{ko ? 'EN' : 'KO'}</button></div>
    </header>

    <nav className="fs-mobile-tabs" aria-label={text('피팅 패널', 'Fitting panels')}>
      <button type="button" aria-pressed={activePanel === 'photos'} onClick={() => setActivePanel('photos')}>{text('사진으로 피팅', 'Photo fitting')}</button>
      <button type="button" aria-pressed={activePanel === 'wardrobe'} onClick={() => setActivePanel('wardrobe')}>{text('샘플 · 설정', 'Samples & settings')}</button>
    </nav>

    <aside className={`fs-photos fs-panel${activePanel === 'photos' ? ' mobile-active' : ''}`}>
      <p className="fs-eyebrow">YOUR DIGITAL WARDROBE</p><h1>{text('사진을,', 'Your style,')}<br /><em>{text('입체로.', 'in a new dimension.')}</em></h1>
      <p className="fs-description">{text('나의 사진과 입고 싶은 옷. 새로운 모습을 360°로 만나보세요.', 'Your photo. The piece you love. Explore a new look from every angle.')}</p>
      <div className="fs-step-heading"><span>01</span><h2>{text('인물 사진', 'The person')}</h2><small>JPG · PNG · WEBP</small></div>
      <UploadCard image={person} label={person ? text('인물 사진 변경', 'Change person photo') : text('전신 사진 업로드', 'Upload full-body photo')} type="person" disabled={busy} onChange={(e) => upload(e, 'person')} />
      <p className="fs-upload-help">{text('한 사람의 전신 · 손발 포함 · 팔을 몸에서 조금 벌린 자세 · 단순한 배경', 'One person, full body, hands and feet visible. Arms slightly apart; a plain background.')}</p>
      <button type="button" className="fs-secondary" disabled={!person || !consent || !connected || busy || !glReady} onClick={() => generate('avatar')}>{text('인물 3D 생성', 'Create person in 3D')}<span>↗</span></button>

      <div className="fs-step-heading"><span>02</span><h2>{text('입고 싶은 옷', 'The garment')}</h2><small>MAX 8 MB</small></div>
      <UploadCard image={garment} label={garment ? text('의류 사진 변경', 'Change garment photo') : text('의류 이미지 업로드', 'Upload garment image')} type="garment" disabled={busy} onChange={(e) => upload(e, 'garment')} />
      <p className="fs-upload-help">{text('정면 제품 사진 권장. 색상·패턴·실루엣이 명확한 이미지를 사용하세요.', 'A front-facing product photo works best. Keep the color, pattern and silhouette visible.')}</p>

      <label className="fs-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={(e) => setConsent(e.target.checked)} /><span>{text('사진 사용 권한이 있으며, 생성할 때 Higgsfield로 사진을 전송하고 크레딧을 사용하는 데 동의합니다.', 'I have permission to use these photos and agree to send them to Higgsfield and use credits when I generate.')}</span></label>
      {!connected && connected !== null && <p className="fs-notice">{text('AI 생성은 연결된 컴퓨터의 로컬 Lab에서 제공됩니다. 샘플 체험과 GLB 불러오기는 계속 사용할 수 있습니다.', 'AI generation requires the local Lab with Higgsfield CLI. Sample outfits and GLB import still work.')}</p>}
      <button type="button" className="fs-primary" disabled={!person || !garment || !consent || !connected || busy || !glReady} onClick={() => generate('look')}>{text('착장 미리보기 생성', 'Generate outfit preview')}<span>↗</span></button>
      <p className="fs-upload-help">{text('착장 이미지 확인 후 3D 생성을 별도로 진행합니다. 각 생성 단계에서 크레딧이 사용됩니다.', 'Review the outfit image before a separate 3D generation. Each generation stage uses credits.')}</p>

      {look && <section className="fs-look"><div className="fs-step-heading"><span>03</span><h2>{text('착장 확인', 'Review the look')}</h2></div><a href={look.url} target="_blank" rel="noreferrer"><img src={look.url} alt={text('AI가 생성한 착장 미리보기', 'AI-generated outfit preview')} /></a><label className="fs-consent"><input type="checkbox" checked={reviewed} disabled={busy} onChange={(e) => setReviewed(e.target.checked)} /><span>{text('한 명의 전신이 온전히 보이고, 원하는 옷이 반영된 것을 확인했습니다.', 'I confirm one complete person is visible and the garment looks correct.')}</span></label><button type="button" className="fs-primary" disabled={!reviewed || !consent || busy || !glReady} onClick={() => generate('mesh')}>{text('이 착장으로 3D 생성', 'Create this look in 3D')}<span>↗</span></button></section>}
      <details className="fs-privacy"><summary>{text('사진 보관 및 결과의 한계', 'Privacy & limitations')}</summary><p>{text('생성 전 사진은 브라우저 안에만 있습니다. 생성 후 로컬 결과는 임시로 보관됩니다. 초기화는 브라우저·로컬 결과만 지우며, Higgsfield에 전송된 자료는 해당 서비스에서 관리해야 합니다. 페이지를 닫아도 이미 시작한 유료 생성은 취소되지 않습니다.', 'Photos stay in your browser until you generate. Results are temporarily cached locally. Reset clears browser and local results, not files already sent to Higgsfield. Closing this page does not cancel a paid generation.')}</p><p>{text('사진 기반 형태·착장 추정입니다. 실제 신체 치수, 얼굴 동일성, 의복 사이즈, 보이지 않는 뒷면과 원단의 물리적 핏은 보장하지 않습니다.', 'This is an image-based reconstruction, not a body scan or cloth simulation. Exact measurements, likeness, garment sizing and unseen details are not guaranteed.')}</p></details>
      <button type="button" className="fs-clear" disabled={busy} onClick={reset}>{text('사진과 로컬 결과 지우기', 'Clear photos & local results')}</button>
    </aside>

    <section className="fs-viewer" aria-label={text('3D 피팅 스튜디오', '3D fitting studio')}>
      <div className="fs-scene" ref={hostRef} />
      <div className="fs-view-top"><span className="fs-source"><i />{demo ? text('샘플 마네킹', 'SAMPLE MANNEQUIN') : currentModel?.kind === 'import' ? text('불러온 3D 모델', 'IMPORTED MODEL') : text('AI 생성 모델', 'AI-GENERATED MODEL')}</span><span className="fs-view-index">360°<small>INTERACTIVE VIEW</small></span></div>
      <div className="fs-model-caption"><span>{demo ? 'THE STUDIO EDIT / 001' : 'YOUR DIGITAL FITTING'}</span><strong>{demo ? (ko ? OUTFITS.find((o) => o.id === outfit).ko : OUTFITS.find((o) => o.id === outfit).name) : currentModel?.kind === 'avatar' ? text('나의 3D 인물', 'Your 3D portrait') : currentModel?.kind === 'import' ? currentModel.name : text('나의 새로운 룩', 'Your new look')}</strong><p>{demo ? text('기본 체험 모델입니다. 업로드한 인물을 복원한 결과가 아닙니다.', 'A sample display model, not a reconstruction of your uploaded photo.') : text('사진 기반 추정 · 실제 사이즈 및 핏 검증용이 아닙니다.', 'Image-based approximation. Not for size or fit verification.')}</p></div>
      <div className="fs-view-controls"><div className="fs-angles">{[[0, text('정면', 'Front')], [Math.PI / 2, text('측면', 'Side')], [Math.PI, text('후면', 'Back')]].map(([angle, label]) => <button type="button" key={angle} disabled={!glReady} onClick={() => { apiRef.current?.rotate(false); setRotate(false); apiRef.current?.angle(angle) }}>{label}</button>)}</div><div className="fs-zoom"><button type="button" aria-label={text('축소', 'Zoom out')} disabled={!glReady} onClick={() => apiRef.current?.zoom(0.3)}>−</button><button type="button" aria-label={text('확대', 'Zoom in')} disabled={!glReady} onClick={() => apiRef.current?.zoom(-0.3)}>+</button></div></div>
      <p className="fs-gesture-hint">{text('드래그로 회전 · 스크롤 / 핀치로 확대', 'DRAG TO ROTATE · SCROLL / PINCH TO ZOOM')}</p>
      {pending && <div className="fs-progress" role="status"><i className="fs-spinner" /><div><strong>{jobLabel}</strong><p>{text('몇 분 정도 걸릴 수 있습니다. 완료되면 결과를 표시합니다.', 'This may take a few minutes. The result appears when it is ready.')}</p>{interrupted && <button type="button" onClick={() => { setInterrupted(false); setError(''); setPollNonce((n) => n + 1) }}>{text('현재 작업 상태 다시 확인', 'Check this job again')}</button>}</div></div>}
    </section>

    <aside className={`fs-wardrobe fs-panel${activePanel === 'wardrobe' ? ' mobile-active' : ''}`}>
      <div className="fs-step-heading"><span>↗</span><h2>{text('샘플 룩 체험', 'The studio edit')}</h2></div><p className="fs-upload-help">{text('별도 생성 없이 마네킹에 입혀보는 세 가지 룩', 'Three mannequin outfits to explore without generation.')}</p>
      <div className="fs-outfits">{OUTFITS.map((item) => <button type="button" key={item.id} className={demo && outfit === item.id ? 'selected' : ''} disabled={busy || !glReady} onClick={() => { setSelected('demo'); setOutfit(item.id); setColor(item.color); apiRef.current?.demo(item.id, item.color) }} aria-pressed={demo && outfit === item.id}><span className="fs-garment-icon" style={{ '--garment': item.color }}><svg viewBox="0 0 64 76" aria-hidden="true"><path d={item.id === 'coat' ? 'M23 9 10 17 5 46 15 49 20 29 17 69 47 69 44 29 49 49 59 46 54 17 41 9 32 15Z' : 'M23 12 11 20 5 47 15 50 21 31 20 61 44 61 43 31 49 50 59 47 53 20 41 12Q32 23 23 12Z'} /><path className="fs-garment-seam" d="M32 19v42M23 35h-4M41 35h4" /></svg></span><span className="fs-outfit-name"><small>{item.index} / {item.material}</small><strong>{ko ? item.ko : item.name}</strong></span><span className="fs-outfit-check">{demo && outfit === item.id ? '✓' : '+'}</span></button>)}</div>
      {demo && <div className="fs-colors"><label htmlFor="fs-color">{text('샘플 색상', 'Sample color')}</label><input type="color" id="fs-color" value={color} onChange={(e) => { setColor(e.target.value); apiRef.current?.demo(outfit, e.target.value) }} disabled={!glReady} /></div>}

      <section className="fs-settings"><h2>{text('스튜디오 설정', 'Studio settings')}</h2><div className="fs-lighting">{[['studio', text('스튜디오', 'Studio')], ['warm', text('웜', 'Warm')], ['dark', text('다크', 'Dark')]].map(([value, label]) => <button type="button" key={value} aria-pressed={light === value} onClick={() => { setLight(value); apiRef.current?.lighting(value) }}>{label}</button>)}</div><label className="fs-toggle"><span>{text('자동 회전', 'Turntable')}</span><input type="checkbox" checked={rotate} disabled={!glReady} onChange={(e) => { setRotate(e.target.checked); apiRef.current?.rotate(e.target.checked) }} /></label><label className="fs-toggle"><span>{text('메시 구조 보기', 'Wireframe')}</span><input type="checkbox" checked={wireframe} disabled={!glReady} onChange={(e) => { setWireframe(e.target.checked); apiRef.current?.wireframe(e.target.checked) }} /></label></section>

      <section className="fs-history"><h2>{text('나의 모델 비교', 'Your model collection')}</h2>{models.length === 0 ? <p className="fs-upload-help">{text('생성한 인물과 착장 모델이 여기에 모입니다.', 'Your generated portraits and outfits appear here.')}</p> : models.map((model, index) => <button type="button" key={model.id} aria-pressed={selected === model.id} disabled={loading || !glReady} onClick={() => selectModel(model.id)}><span>{String(index + 1).padStart(2, '0')}</span>{model.kind === 'avatar' ? text('원본 인물', 'Original person') : model.kind === 'import' ? text('불러온 모델', 'Imported model') : text('생성한 착장', 'Generated outfit')}<small>{selected === model.id ? '●' : '○'}</small></button>)}</section>
      <label className="fs-import">↑ {text('GLB 모델 불러오기', 'Import a GLB model')}<input type="file" accept=".glb,model/gltf-binary" onChange={importModel} disabled={busy || !glReady} aria-label={text('GLB 모델 불러오기', 'Import a GLB model')} /></label><p className="fs-upload-help">{text('텍스처가 포함된 단일 GLB · 50MB 이하', 'Self-contained GLB with textures · max 50 MB')}</p>
      <button type="button" className="fs-secondary" disabled={!glReady || loading} onClick={async () => save(await apiRef.current?.snapshot(), 'fitting-atelier.png')}>{text('현재 화면 저장', 'Save this view')}<span>↓</span></button>
      {currentModel && <button type="button" className="fs-secondary" onClick={() => save(new Blob([currentModel.buffer], { type: 'model/gltf-binary' }), 'fitting-atelier.glb')}>{text('3D 모델 다운로드', 'Download 3D model')}<span>↓</span></button>}
      <p className="fs-edition">FORM / FABRIC / IDENTITY<br />AN EXPERIMENT BY EVAN.</p>
    </aside>
    {error && <div className="fs-error" role="alert"><span>{ERROR_COPY[ko ? 'ko' : 'en'][error] || error}</span><button type="button" aria-label={text('오류 알림 닫기', 'Dismiss error')} onClick={() => setError('')}>×</button></div>}
  </main>
}
