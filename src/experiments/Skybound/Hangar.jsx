import { AIRCRAFT } from './aircraft.js'

function AircraftDrawing({ aircraft }) {
  const glider = aircraft.id === 'sailplane', jet = aircraft.id === 'jet'
  return <svg className="sb-aircraft-drawing" viewBox="0 0 200 90" aria-hidden="true" style={{ color: aircraft.color }}>
    <ellipse cx="100" cy="76" rx="57" ry="3" fill="#284b4412" />
    <path d={jet ? 'M95 37 38 65 35 72 101 55 165 72 162 65 105 37Z' : `M96 33 ${glider ? '8 44 8 49' : '30 37 26 48'} 100 48 ${glider ? '192 49 192 44' : '174 48 170 37'} 104 33Z`} fill="currentColor" />
    {jet && <><rect x="82" y="49" width="9" height="19" rx="4" fill="currentColor" /><rect x="109" y="49" width="9" height="19" rx="4" fill="currentColor" /></>}
    <path d="M100 9C91 9 92 32 94 44L97 69 76 74 76 78 100 76 124 78 124 74 103 69 106 44C108 32 109 9 100 9Z" fill="#f8f2df" stroke="#5c766d" strokeWidth="1" />
    <path d="M97 25Q100 22 103 25L104 37 96 37Z" fill="#557a83" />
    <path d="M100 61V77" stroke="currentColor" strokeWidth="3" />
    {!jet && <path d="M87 13H113" stroke="#3d5758" strokeWidth="2" />}
  </svg>
}

export default function Hangar({ progress, onSelect, onClose, saveFailed }) {
  return <section className="sb-hangar" aria-label="비행기 격납고">
    <div className="sb-hangar-heading"><div><span className="sb-overline">YOUR NEXT HORIZON</span><h1>나만의 격납고</h1></div><button type="button" className="sb-hangar-close" onClick={onClose} aria-label="격납고 닫기">×</button></div>
    <p className="sb-hangar-copy">체크포인트마다 100골드. 새로운 비행기로 더 먼 하늘까지.</p>
    <div className="sb-hangar-balance"><span>보유 골드</span><strong>{progress.gold.toLocaleString()} <small>G</small></strong><span>보유 기체 {progress.owned.length} / {AIRCRAFT.length}</span></div>
    <div className="sb-aircraft-grid">{AIRCRAFT.map((aircraft) => {
      const owned = progress.owned.includes(aircraft.id), selected = progress.selected === aircraft.id
      const shortfall = Math.max(0, aircraft.price - progress.gold)
      return <article key={aircraft.id} className={`sb-aircraft-card${selected ? ' sb-selected-aircraft' : ''}`}>
        <div className="sb-aircraft-topline"><span>{aircraft.subtitle}</span><span>{selected ? '선택됨' : owned ? '보유' : `${aircraft.price.toLocaleString()} G`}</span></div>
        <AircraftDrawing aircraft={aircraft} />
        <h2>{aircraft.name}</h2><p>{aircraft.description}</p>
        <div className="sb-aircraft-spec"><span>최고 {Math.round(aircraft.maxSpeed * 3.6)} km/h</span><span>{aircraft.handling}</span></div>
        <button type="button" disabled={selected || (!owned && shortfall > 0)} onClick={() => onSelect(aircraft.id)} aria-label={`${aircraft.name} ${owned ? '선택' : '구매'}`}>
          {selected ? '현재 비행기' : owned ? '이 비행기 선택' : shortfall > 0 ? `${shortfall.toLocaleString()} G 더 필요해요` : `${aircraft.price.toLocaleString()} G · 구매하고 선택`}
        </button>
      </article>
    })}</div>
    <p className="sb-hangar-note" role="status">{saveFailed ? '브라우저 저장 공간을 사용할 수 없어 이번 접속 동안만 유지됩니다.' : '골드와 구매한 비행기는 이 브라우저에 자동 저장됩니다.'}</p>
    <button type="button" className="sb-start" onClick={onClose}>비행 준비하기 <span>↗</span></button>
  </section>
}
