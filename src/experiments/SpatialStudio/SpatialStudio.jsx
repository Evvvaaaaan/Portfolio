import { useEffect, useRef, useState } from 'react'
import SpatialViewer from './SpatialViewer'
import { isStableScene } from './navigation'
import './SpatialStudio.css'

const API = '/api/spatial'
const STAGES = { queued: '변환 준비', validating: '사진 확인', understanding: '가구와 공간 배치 분석',
  solidifying: '닫힌 입체로 3D 조립', verifying: '39개 시점 · 형태 안정성 검사', ready: '공간 준비 완료',
  failed: '변환 실패', cancelled: '변환 취소' }
const TERMINAL = ['ready', 'failed', 'cancelled']
const number = value => new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }).format(value)

function Icon({ name, size = 20, ...props }) {
  const paths = {
    cube: <><path d="m12 2 9 5v10l-9 5-9-5V7Z"/><path d="m3 7 9 5 9-5M12 12v10M7.5 4.5l9 5v5"/></>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    image: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-7 5 8"/></>,
    reset: <><path d="M4 10a8 8 0 1 1 .6 6M4 4v6h6"/></>,
    expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
    layers: <><path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 17l10 5 10-5"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 8a2.5 2.5 0 1 1 4 2c-1.5 1-1.5 1-1.5 3m0 3v.1"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/></>,
    move: <><path d="M12 2v20M2 12h20m-7-7-3-3-3 3m6 14-3 3-3-3M5 9l-3 3 3 3m14-6 3 3-3 3"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.cube}</svg>
}

async function api(path, options) {
  const response = await fetch(`${API}${path}`, options)
  if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('로컬 복원 서버에 연결할 수 없습니다.')
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.')
  return data
}

export default function SpatialStudio() {
  const [files, setFiles] = useState([])
  const [name, setName] = useState('')
  const [quality, setQuality] = useState('detail')
  const [photoIndex, setPhotoIndex] = useState(0)
  const [health, setHealth] = useState(null)
  const [job, setJob] = useState(null)
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [scene, setScene] = useState(null)
  const [mode, setMode] = useState('realistic')
  const [cameraIndex, setCameraIndex] = useState(0)
  const [resetKey, setResetKey] = useState(0)
  const [viewerReady, setViewerReady] = useState(false)
  const [viewerError, setViewerError] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [guide, setGuide] = useState(false)
  const fileInput = useRef(null)
  const viewport = useRef(null)
  const dialog = useRef(null)
  const urls = useRef(new Set())
  const busy = submitting || (job && !TERMINAL.includes(job.stage))
  const metadata = scene?.metadata
  const stable = isStableScene(metadata)
  const jobId = job?.id
  const jobStage = job?.stage

  function openScene(data) {
    if (data.stage !== 'ready') { setJob(data); return }
    setJob(data)
    setScene({ base: `${API}/jobs/${data.id}`, metadata: data.result, name: data.name, sample: false })
    setPhotoIndex(0)
    setCameraIndex(0)
    setMode('realistic')
    setViewerReady(false)
    setViewerError('')
    setShowHistory(false)
    try { localStorage.setItem('spatial-last-job', data.id) } catch { /* Storage may be disabled. */ }
  }

  useEffect(() => {
    let stopped = false
    const load = async () => {
      try {
        const result = await api('/health')
        if (!stopped) setHealth(result)
        const list = await api('/jobs')
        if (!stopped) setHistory(list.jobs)
        let last
        try { last = localStorage.getItem('spatial-last-job') } catch { /* No persistent storage. */ }
        const previous = list.jobs.find(item => item.id === last) || list.jobs.find(item => !TERMINAL.includes(item.stage))
        if (previous && !stopped) {
          if (previous.stage === 'ready') { openScene(previous); return }
          setJob(previous)
        }
      } catch { if (!stopped) setHealth({ ready: false }) }
      try {
        const response = await fetch('/spatial-demo/scene.json')
        if (!response.ok) return
        const data = await response.json()
        if (!stopped) {
          setScene({ base: '/spatial-demo', metadata: data, name: 'The light room', sample: true })
          setPhotoIndex(0)
        }
      } catch { /* Upload remains available without the example. */ }
    }
    load()
    return () => { stopped = true }
  }, [])

  useEffect(() => () => { urls.current.forEach(url => URL.revokeObjectURL(url)) }, [])

  useEffect(() => {
    if (!jobId || TERMINAL.includes(jobStage)) return
    let stopped = false
    let timer
    const poll = async () => {
      try {
        const data = await api(`/jobs/${jobId}`)
        if (stopped) return
        setJob(data)
        if (data.stage === 'ready') {
          openScene(data)
          const list = await api('/jobs')
          if (!stopped) setHistory(list.jobs)
          return
        }
        if (TERMINAL.includes(data.stage)) { setError(data.error || '변환이 중단되었습니다.'); return }
        setError('')
      } catch (failure) {
        if (!stopped) setError(`${failure.message} 연결을 다시 확인하고 있습니다.`)
      }
      if (!stopped) timer = setTimeout(poll, 1400)
    }
    timer = setTimeout(poll, 500)
    return () => { stopped = true; clearTimeout(timer) }
  }, [jobId, jobStage])

  useEffect(() => {
    if (guide) dialog.current?.showModal()
    else dialog.current?.close()
  }, [guide])

  const addFiles = incoming => {
    if (busy) return
    setError('')
    const additions = Array.from(incoming)
    if (additions.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024)) {
      setError('12MB 이하의 JPG, PNG, WebP 사진을 선택해 주세요.'); return
    }
    if (files.length + additions.length > 8) { setError('한 공간에 최대 8장의 사진을 사용할 수 있습니다.'); return }
    if ([...files.map(item => item.file), ...additions].reduce((sum, file) => sum + file.size, 0) > 48 * 1024 * 1024) {
      setError('사진의 총 용량은 48MB 이하여야 합니다.'); return
    }
    const next = additions.map(file => {
      const url = URL.createObjectURL(file)
      urls.current.add(url)
      return { file, url, id: crypto.randomUUID() }
    })
    setFiles(current => [...current, ...next])
    if (!name && additions[0]) setName(additions[0].name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '))
    if (fileInput.current) fileInput.current.value = ''
  }

  const removeFile = id => {
    const removed = files.find(item => item.id === id)
    if (removed) { URL.revokeObjectURL(removed.url); urls.current.delete(removed.url) }
    setFiles(current => current.filter(item => item.id !== id))
  }

  const generate = async () => {
    if (!files.length || busy) return
    setSubmitting(true)
    setError('')
    try {
      const body = new FormData()
      files.forEach(item => body.append('images', item.file))
      body.append('name', name || '나의 공간')
      body.append('quality', quality)
      body.append('completion', 'solid')
      const data = await api('/jobs', { method: 'POST', body })
      setJob(data)
      try { localStorage.setItem('spatial-last-job', data.id) } catch { /* Optional. */ }
    } catch (failure) { setError(failure.message) }
    finally { setSubmitting(false) }
  }

  const cancel = async () => {
    try { setJob(await api(`/jobs/${job.id}/cancel`, { method: 'POST' })) }
    catch (failure) { setError(failure.message) }
  }

  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await viewport.current?.requestFullscreen()
    } catch { setError('이 브라우저에서는 전체 화면을 지원하지 않습니다.') }
  }

  const loadSample = async () => {
    try {
      const response = await fetch('/spatial-demo/source-0.jpg')
      if (!response.ok) throw new Error('샘플 사진을 찾을 수 없습니다.')
      const file = new File([await response.blob()], 'The light room.jpg', { type: 'image/jpeg' })
      addFiles([file])
    } catch (failure) { setError(failure.message) }
  }

  return <main className="spatial-studio">
    <header className="sp-header">
      <a href="/spatial" className="sp-brand" aria-label="Spatial Studio 홈"><span className="sp-brand-mark"><Icon name="cube" size={26}/></span>spatial<span className="sp-brand-dot">.</span><span className="sp-brand-studio">STUDIO</span></a>
      <div className="sp-header-center"><span/> A new dimension to your photographs</div>
      <nav><button className={showHistory ? 'is-active' : ''} onClick={() => setShowHistory(!showHistory)}><Icon name="layers" size={16}/>내 공간<span className="sp-count">{history.filter(item => item.stage === 'ready').length}</span></button><button className="sp-help" onClick={() => setGuide(true)} aria-label="촬영 가이드"><Icon name="help"/></button></nav>
    </header>

    <div className="sp-layout">
      <aside className="sp-sidebar">
        <div className="sp-sidebar-intro"><p className="sp-eyebrow">FROM PHOTO TO PRESENCE</p><h1>사진 속 공간을,<br/><em>입체로 만나세요.</em></h1><p className="sp-intro-copy">한 장의 사진에서 시작하는 새로운 시점.<br/>당신의 공간을 입체적으로 다시 만나세요.</p></div>
        <section className="sp-input-section">
          <div className="sp-section-label"><span><b>01</b> 공간의 사진</span><span>{files.length} / 8</span></div>
          <input ref={fileInput} className="sp-file-input" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={event => addFiles(event.target.files)} disabled={busy} aria-label="공간 사진 업로드"/>
          <button className={`sp-dropzone ${dragging ? 'is-dragging' : ''}`} disabled={busy} onClick={() => fileInput.current?.click()}
            onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
            onDrop={event => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files) }}>
            <span className="sp-upload-icon"><Icon name="upload" size={23}/></span><strong>{files.length ? '다른 시점 추가하기' : '공간의 사진을 놓아주세요'}</strong><span>또는 클릭하여 사진 선택</span><small>JPG, PNG, WebP · 장당 최대 12MB</small>
          </button>
          {files.length > 0 && <div className="sp-input-thumbnails">{files.map((item, index) => <div key={item.id}><img src={item.url} alt={`업로드 사진 ${index + 1}`}/><span>{String(index + 1).padStart(2, '0')}</span><button onClick={() => removeFile(item.id)} disabled={busy} aria-label={`사진 ${index + 1} 삭제`}><Icon name="close" size={12}/></button></div>)}</div>}
          <p className="sp-capture-hint"><span>↗</span> 첫 사진을 기준으로 공간을 구성합니다.<br/>추가 사진은 가구를 이해하는 참고 자료예요.</p>
          <button className="sp-text-button" onClick={() => setGuide(true)}>좋은 결과를 위한 촬영 팁 <span>↗</span></button>
        </section>
        <section className="sp-input-section sp-options">
          <div className="sp-section-label"><span><b>02</b> 공간 설정</span></div>
          <label className="sp-field-label" htmlFor="sp-name">공간 이름</label><input id="sp-name" className="sp-name" maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="예: 햇살이 드는 거실" disabled={busy}/>
          <div className="sp-quality-label"><span>미리보기 렌더링</span><span>형태 검사는 동일하게</span></div>
          <div className="sp-quality">{[['balanced', '균형', '기본 미리보기'], ['detail', '고품질', '더 부드러운 미리보기']].map(([value, title, description]) => <button key={value} disabled={busy} className={quality === value ? 'is-selected' : ''} onClick={() => setQuality(value)} aria-pressed={quality === value}><span>{title}{quality === value && <Icon name="check" size={14}/>}</span><small>{description}</small></button>)}</div>
          <div className="sp-quality-label"><span>안정형 3D 재구성</span><span>API 요금 0원</span></div>
          <p className="sp-completion-notice">벽과 가구를 두께 있는 입체로 조립합니다. 실제와 다른 간결한 CG 형태이며, 사진 질감을 늘여 붙이지 않습니다. 39개 시점 검사를 거쳐 표시합니다. 전력·장비 비용은 별도입니다.</p>
          {health && !health.ready && <p className="sp-error">로컬 엔진 설치: <code>npm run spatial:setup</code><br/>최초 모델 다운로드 약 4.3GB. 실행 환경과 저장 공간이 추가로 필요합니다.</p>}
        </section>
        <div className="sp-submit-area">
          {error && <p className="sp-error" role="alert">{error}</p>}
          <button className="sp-generate" disabled={!files.length || busy || !health?.ready} onClick={generate}>{busy ? <><span className="sp-spinner"/>{submitting ? '사진 업로드 중' : STAGES[job.stage]}</> : <>공간 만들기 <Icon name="arrow" size={20}/></>}</button>
          {busy && <div className="sp-job-progress"><progress max="100" value={job?.progress || 0}/><div><span>{job?.progress || 0}% · {job?.elapsed ? `${job.elapsed}초` : '준비 중'}</span><button onClick={cancel} disabled={!job}>취소</button></div></div>}
          <p className="sp-private"><Icon name="lock" size={12}/>{health?.ready ? '사진은 이 컴퓨터에서만 처리됩니다' : health === null ? '복원 엔진 연결 확인 중' : '로컬 복원 엔진 연결이 필요합니다'}</p>
        </div>
        <div className="sp-sample-card"><img src="/spatial-demo/source-0.jpg" alt="햇빛이 드는 거실 샘플"/><div><span>사진이 준비되지 않았다면</span><button onClick={loadSample} disabled={busy || files.length >= 8}>샘플 사진으로 시작하기 <span>↗</span></button></div></div>
        <a className="sp-lab-link" href="/gallery">← Evan’s lab</a>
      </aside>

      <section className="sp-workspace">
        <div className="sp-workspace-heading"><div><span className="sp-eyebrow">{scene?.sample ? 'SAMPLE SPACE / 001' : 'YOUR SPACE'}</span><h2>{scene?.name || '당신의 공간을 기다리고 있어요'}</h2></div><span className="sp-engine"><i className={health?.ready ? 'online' : ''}/>{health?.ready ? '로컬 엔진 연결됨' : '미리보기 모드'}</span></div>
        {scene && !stable && <p className="sp-error" role="status">이전 방식의 3D 결과는 형태 안정성이 확인되지 않아 표시하지 않습니다. 원본 사진을 보존했습니다. 사진을 다시 선택해 안정형 3D로 생성해 주세요.</p>}
        {stable && <div className="sp-reconstruction-modes"><span>안정형 3D · 좌우 180°</span><span>닫힌 입체 · {metadata.qualityGate.inspectedViews}개 시점 검사 · CG 재구성</span></div>}
        {viewerError && <p className="sp-error" role="alert">{viewerError}</p>}
        <div className="sp-viewport" ref={viewport}>
          {stable && <SpatialViewer base={scene.base} metadata={metadata} mode={mode} cameraIndex={cameraIndex} resetKey={resetKey} exploring={mode !== 'photo'} onReady={() => setViewerReady(true)} onError={setViewerError}/>}
          {scene && (mode === 'photo' || !viewerReady || !stable) && <img className="sp-source-overlay" src={`${scene.base}/${mode === 'photo' || !stable || viewerError ? `source-${photoIndex}.jpg` : 'preview.jpg'}`} alt={mode === 'photo' || !stable || viewerError ? '업로드한 원본 사진' : '검증된 3D 미리보기'}/>}
          {!scene && <div className="sp-empty"><Icon name="cube" size={60}/><p>사진 한 장으로 열리는 공간</p><span>왼쪽에서 공간의 사진을 선택하세요.</span></div>}
          <div className="sp-viewport-top"><span className="sp-live-tag"><i/>{mode === 'photo' || !stable ? '원본 사진' : 'SOLID 3D'}</span><div className="sp-view-actions"><button onClick={() => setResetKey(value => value + 1)} disabled={!stable} aria-label="시점 초기화" title="시점 초기화"><Icon name="reset" size={17}/></button><button onClick={fullscreen} aria-label="전체 화면" title="전체 화면"><Icon name="expand" size={17}/></button></div></div>
          {!viewerReady && stable && !viewerError && <div className="sp-loading-tag"><span className="sp-spinner"/>3D 공간 불러오는 중</div>}
          {busy && <div className="sp-processing"><div className="sp-scan-line"/><span className="sp-spinner"/><strong>{STAGES[job?.stage] || '사진 업로드 중'}</strong><span>시간이 걸려도 형태 검사 후 표시합니다. 사진은 외부로 전송하지 않습니다.</span></div>}
          <div className="sp-viewport-bottom"><span className="sp-interaction-hint"><Icon name="move" size={13}/>{mode === 'photo' || !stable ? '업로드한 원본 사진' : '좌우 180° 드래그 · 내부를 위한 벽면 생략'}</span><span className="sp-coordinate">{stable ? `${String(cameraIndex + 1).padStart(2, '0')} / ${String(metadata.cameras.length).padStart(2, '0')}` : 'PHOTO'}</span></div>
        </div>

        <div className="sp-toolbar"><div className="sp-view-modes" role="group" aria-label="표시 방식">{[['realistic', 'cube', '공간'], ['photo', 'image', '원본'], ['wireframe', 'layers', '구조']].map(([value, icon, title]) => <button key={value} disabled={!scene || (!stable && value !== 'photo')} className={mode === value ? 'is-selected' : ''} onClick={() => setMode(value)} aria-pressed={mode === value}><Icon name={icon} size={16}/>{title}</button>)}</div><div className="sp-toolbar-right"><span className="sp-output-label">{stable ? 'SOLID · BLENDER READY' : 'ORIGINAL PRESERVED'}</span>{stable && <details className="sp-download"><summary><Icon name="download" size={16}/>내보내기<span>⌄</span></summary><div>{[['scene.blend', 'Blender 프로젝트', '.blend'], ['scene.glb', '3D 모델', '.glb']].map(([file, label, extension]) => <a href={`${scene.base}/${file}?download=1`} download={`spatial-${file}`} key={file}>{label}<span>{extension}</span></a>)}</div></details>}</div></div>

        <div className="sp-space-details"><div className="sp-source-views"><span className="sp-eyebrow">{mode === 'photo' || !stable ? 'ORIGINAL PHOTOS' : '3D INSPECTION VIEWS'}</span><div>{stable && mode !== 'photo' ? metadata.cameras.map((view, index) => <button key={index} className={cameraIndex === index ? 'is-selected' : ''} onClick={() => { setCameraIndex(index); setResetKey(value => value + 1) }} aria-label={`3D 시점 ${view.yawDegrees}도`}><img src={`${scene.base}/${view.image}`} alt={`입체 ${view.yawDegrees}도`}/><span>{view.yawDegrees}°</span></button>) : Array.from({ length: metadata?.sourceCount || 0 }, (_, index) => <button key={index} className={photoIndex === index ? 'is-selected' : ''} onClick={() => setPhotoIndex(index)} aria-label={`원본 사진 ${index + 1}`}><img src={`${scene.base}/source-${index}.jpg`} alt={`원본 ${index + 1}`}/><span>{index + 1}</span></button>)}<div className="sp-view-info"><strong>사진 {metadata?.sourceCount || '—'}장{stable ? ` · 입체 요소 ${metadata.objectCount}개` : ''}</strong><span>{stable ? `${number(metadata.triangles)}개의 삼각형` : '원본 사진 보존'}</span></div></div></div><div className="sp-detail-note"><span className="sp-note-dot"/><p>사진의 배치와 색을 참고한 CG 공간입니다. 가구의 실제 모양·치수·가려진 부분은 다를 수 있습니다. 회전해도 각 가구의 닫힌 입체는 유지됩니다.</p></div></div>
        <footer className="sp-footer"><span>LESS CAPTURE. MORE SPACE.</span><span>Photo-based reconstruction <i/> Blender workflow</span></footer>
      </section>
    </div>

    {showHistory && <section className="sp-history" aria-label="내 공간 목록"><div><h2>내 공간</h2><button onClick={() => setShowHistory(false)} aria-label="공간 목록 닫기"><Icon name="close"/></button></div>{history.length ? history.map(item => <button className="sp-history-item" key={item.id} onClick={() => openScene(item)}><img src={`${API}/jobs/${item.id}/${item.stage === 'ready' && isStableScene(item.result) ? 'preview' : 'source-0'}.jpg`} alt=""/><span><strong>{item.name}</strong><small>{STAGES[item.stage] || '이전 생성'} · 사진 {item.imageCount}장</small></span><Icon name="arrow" size={16}/></button>) : <p>사진으로 만든 공간이 여기에 저장됩니다.</p>}</section>}
    <dialog className="sp-guide" ref={dialog} onClose={() => setGuide(false)} onClick={event => { if (event.target === dialog.current) setGuide(false) }}><div><button className="sp-guide-close" onClick={() => setGuide(false)} aria-label="촬영 가이드 닫기"><Icon name="close"/></button><p className="sp-eyebrow">A LITTLE CARE, A BETTER SPACE</p><h2>공간이 잘 보이는<br/>사진이면 충분해요.</h2><ol><li><strong>전체 구도를 첫 사진으로.</strong><p>가구와 바닥, 벽이 함께 보이는 사진을 선택하세요. 첫 사진에서 읽은 물체 위치를 기준으로 입체를 배치합니다.</p></li><li><strong>추가 사진은 참고 자료예요.</strong><p>같은 공간의 다른 사진을 함께 사용할 수 있습니다. 정밀한 다중 시점 스캔이나 촬영 위치 복원을 수행하는 방식은 아닙니다.</p></li><li><strong>밝고 선명하게 촬영하세요.</strong><p>거울과 가림이 많으면 물체를 잘못 인식할 수 있어요. 인식한 가구를 단순한 입체 부품으로 조립하므로 작은 장식과 질감은 생략됩니다.</p></li></ol><div className="sp-guide-note">형태 안정성을 우선한 CG 재구성입니다. 실제 치수·배치·가구 디자인과 다를 수 있으며, 측정용 도면이나 완전한 360° 스캔을 대신하지 않습니다.</div><button className="sp-generate" onClick={() => setGuide(false)}>사진 준비하기 <Icon name="arrow"/></button></div></dialog>
  </main>
}
