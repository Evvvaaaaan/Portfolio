import { useEffect, useRef } from 'react'
import { CONTRACTS, VEHICLES, WEAPONS, rankFor } from './progress.js'
import { DISTRICTS, SERVICES, STASHES } from './world.js'
import { drawMap } from './scene.js'

export default function CityPanel({ ui, lang, command }) {
  const ko = lang === 'ko', rank = rankFor(ui.xp), map = useRef(null), dialog = useRef(null)
  const label = (en, kr) => ko ? kr : en
  const tabs = [['contracts', 'Contracts', '의뢰'], ['garage', 'Garage', '차고'], ['armory', 'Armory', '무기점'], ['map', 'City map', '도시 지도'], ['safehouse', 'Career', '기록']]
  const shop = SERVICES.find((s) => (s.type || s.id) === ui.panel && Math.hypot(ui.position.x - s.x, ui.position.z - s.z) < 13)
  const shopping = Boolean(shop) && ui.speed < 15
  useEffect(() => { dialog.current?.focus() }, [ui.panel])
  useEffect(() => { if (ui.panel === 'map' && map.current) drawMap(map.current, ui.mapState) }, [ui.panel, ui.mapState])
  const guide = (type) => command('waypoint', [...SERVICES].filter((s) => (s.type || s.id) === type).sort((a, b) => Math.hypot(a.x - ui.position.x, a.z - ui.position.z) - Math.hypot(b.x - ui.position.x, b.z - ui.position.z))[0])
  return <div className="md-panel-shade">
    <section className="md-panel" ref={dialog} role="dialog" aria-modal="true" aria-label={label('City network', '도시 네트워크')} tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key !== 'Tab') return
        const controls = [...dialog.current.querySelectorAll('button:not(:disabled), input')]
        if (!controls.length) return
        const first = controls[0], last = controls.at(-1)
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }}>
      <header className="md-panel-head"><div><span className="md-eyebrow">AFTER HOURS / CITY NETWORK</span><h2>{label('Make this city yours.', '이 도시를 당신의 것으로.')}</h2></div><button type="button" onClick={() => command('close')} aria-label={label('Close city network', '도시 네트워크 닫기')}>✕</button></header>
      <div className="md-wallet"><strong>${ui.cash.toLocaleString()}</strong><span>{label('REPUTATION', '명성')} {rank} / 5 · {ui.xp} XP</span><small>{label('The city is paused while browsing.', '화면을 보는 동안 도시는 일시 정지됩니다.')}</small></div>
      <nav className="md-tabs" aria-label={label('City network sections', '도시 메뉴')}>{tabs.map(([id, en, kr]) => <button type="button" key={id} aria-pressed={ui.panel === id} onClick={() => command('panel', id)}>{label(en, kr)}</button>)}</nav>
      <div className="md-panel-body">
        {ui.panel === 'contracts' && <><p className="md-panel-hint">{label('Pick a job. Accepting replaces your current contract. Completed jobs pay cash and unlock better equipment.', '완료하면 현금과 명성을 얻습니다. 새 의뢰를 수락하면 진행 중인 의뢰가 교체됩니다.')}</p><div className="md-catalog">{CONTRACTS.map((c, i) => <article className="md-product" key={c.id}>
          <span className="md-product-index">0{i + 1} / {c.id.toUpperCase()}</span><h3>{ko ? c.ko : c.name}</h3><p>{ko ? c.detailKo : c.detail}</p>
          <div className="md-product-bottom"><strong>${(c.id === 'delivery' ? ui.nextReward : c.reward).toLocaleString()}</strong><button type="button" disabled={rank < c.rank || (c.id === 'bounty' && !ui.weapon)} onClick={() => command('contract', c.id)}>{rank < c.rank ? label('Rank ', '명성 ') + c.rank : c.id === 'bounty' && !ui.weapon ? label('Weapon required', '총기 구매 필요') : label('Accept job', '의뢰 수락')}</button></div>
        </article>)}</div></>}
        {(ui.panel === 'garage' || ui.panel === 'armory') && <>
          <div className="md-shop-location"><p>{shopping ? label('You are at the shop. Purchases are saved automatically.', '상점에 도착했습니다. 구매 내용은 자동 저장됩니다.') : label('Visit the shop and stop nearby to purchase or equip.', '구매·장착하려면 해당 상점 근처에 정차하세요.')}</p>{!shopping && <button type="button" onClick={() => guide(ui.panel)}>{label('Set GPS', '길 안내')} ↗</button>}</div>
          <div className="md-catalog">{(ui.panel === 'garage' ? VEHICLES : WEAPONS).map((item, index) => {
            const car = ui.panel === 'garage', owned = car ? ui.cars.includes(item.id) : Boolean(ui.weapons[item.id]), active = car ? ui.carId === item.id : ui.weapon === item.id
            return <article className="md-product" key={item.id} data-item={item.id}>
              <div className={`md-item-art ${car ? 'md-item-car' : 'md-item-gun'}`} style={{ '--item-color': item.color || '#d89b9c', '--item-length': car ? item.length : 1 + index * 0.25 }} aria-hidden="true"><i /><b /><em /></div>
              <span className="md-product-index">{car ? 'MOTOR POOL' : 'NIGHT OWL SUPPLY'} / 0{index + 1}</span><h3>{ko ? item.ko : item.name}</h3>
              <p>{car ? `${Math.round(item.speed * 3.6)} KM/H · ${label('ARMOR', '장갑')} ×${item.armor} · ${label('HANDLING', '조향')} ${item.handling}` : `${label('DAMAGE', '피해')} ${item.damage}${item.pellets > 1 ? ' × 5' : ''} · ${item.magazine} ${label('ROUNDS', '발')} · ${item.range} M`}</p>
              <div className="md-product-bottom"><strong>{owned ? label('OWNED', '보유 중') : '$' + item.price.toLocaleString()}</strong><button type="button" disabled={!shopping || rank < item.rank || (!owned && ui.cash < item.price)} onClick={() => command(car ? 'buyCar' : 'buyWeapon', item.id)}>{rank < item.rank ? label('Rank ', '명성 ') + item.rank : active ? car ? label('Recall', '차량 호출') : label('Equipped', '장착 중') : owned ? label('Equip', '선택') : ui.cash < item.price ? label('Need cash', '잔액 부족') : label('Buy', '구매')}</button></div>
            </article>
          })}</div>
          <div className="md-services">{ui.panel === 'garage' ? <button type="button" disabled={!shopping || ui.cash < 150} onClick={() => command('service', 'repair')}>{label('Repair + respray', '수리 + 수배 해제')} · $150</button> : <><button type="button" disabled={!shopping || !ui.weapon || ui.cash < 120} onClick={() => command('service', 'ammo')}>{label('Ammo refill', '탄약 보충')} · $120</button><button type="button" disabled={!shopping || ui.armor >= 100 || ui.cash < 250} onClick={() => command('service', 'armor')}>{label('Body armor', '방탄복')} · $250</button></>}</div>
        </>}
        {ui.panel === 'map' && <div className="md-city-map"><canvas ref={map} width="650" height="650" role="img" aria-label={label('Expanded city map', '확장 도시 지도')} /><div><p className="md-panel-hint">{label('Choose a destination for GPS. Gold dots are hidden cash stashes.', '목적지를 선택하면 길을 안내합니다. 금색 점은 숨겨진 현금입니다.')}</p>{DISTRICTS.map((d) => <button key={d.id} type="button" onClick={() => command('waypoint', d)}><i style={{ background: d.color }} />{ko ? d.ko : d.name}<span>↗</span></button>)}{SERVICES.map((s) => <button type="button" key={s.id} onClick={() => command('waypoint', s)}><b style={{ color: s.color }}>{s.icon}</b>{ko ? s.ko : s.name}<span>↗</span></button>)}</div></div>}
        {ui.panel === 'safehouse' && <><div className="md-career-stats"><div><span>{label('JOBS COMPLETED', '완료한 의뢰')}</span><strong>{ui.completed}</strong></div><div><span>{label('LIFETIME EARNINGS', '누적 수입')}</span><strong>${ui.earned.toLocaleString()}</strong></div><div><span>{label('CASH STASHES', '숨겨진 현금')}</span><strong>{ui.found.length} / {STASHES.length}</strong></div><div><span>{label('GARAGE COLLECTION', '차량 컬렉션')}</span><strong>{ui.cars.length} / {VEHICLES.length}</strong></div></div>
          <p className="md-panel-hint">{label('Cash, weapons, ammunition, vehicles and reputation are saved in this browser. On return, your next delivery starts at the hideout.', '현금·총기·탄약·차량·명성은 이 브라우저에 저장됩니다. 다시 접속하면 은신처에서 다음 배달을 시작합니다.')}</p>
          <h3>{label('CITY ATMOSPHERE', '도시 분위기')}</h3><div className="md-themes">{[['night', 'Neon midnight', '네온의 밤'], ['sunset', 'Golden hour', '골든 아워'], ['rain', 'Rain city', '비 오는 도시']].map(([id, en, kr]) => <button type="button" key={id} aria-pressed={ui.theme === id} onClick={() => command('theme', id)}>{label(en, kr)}</button>)}</div><p className="md-panel-hint">{label('Rain reduces tire grip. Calm effects disable falling rain and flashing lights.', '비가 오면 타이어 접지력이 줄어듭니다. 효과 줄이기를 켜면 빗줄기와 경광등 점멸을 줄입니다.')}</p>
          <div className="md-services"><button type="button" onClick={() => shopping ? command('service', 'rest') : guide('safehouse')}>{shopping ? label('Rest & recover · FREE', '휴식 · 무료 회복') : label('Find the hideout ↗', '은신처로 길 안내 ↗')}</button></div>
        </>}
      </div>
      <footer className="md-panel-footer"><span role="status">{ui.panelNotice}</span><span>{ui.saveFailed ? label('Saving unavailable · session only', '저장 불가 · 현재 세션만 유지') : label('LOCAL AUTO-SAVE', '브라우저 자동 저장')}</span></footer>
    </section>
  </div>
}
