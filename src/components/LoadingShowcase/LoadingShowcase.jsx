import './LoadingShowcase.css'

const W = ({ children }) => <div className="lc-wrap">{children}</div>

/* 1 */ const BlobPulse     = () => <W><div className="bp" /></W>
/* 2 */ const Amoeba        = () => <W><div className="am" /></W>
/* 3 */ const GooRing       = () => <W><div className="gr-wrap"><div className="gr-goo">{[0,1,2,3,4,5,6,7].map(i=><div key={i} className="gr-dot" style={{'--i':i}}/>)}</div></div></W>
/* 4 */ const OozeDots      = () => <W><div className="od">{[0,1,2].map(i=><div key={i} className="od-dot" style={{'--i':i}}/>)}</div></W>
/* 5 */ const BreathBlob    = () => <W><div className="bb" /></W>
/* 6 */ const MorphPair     = () => <W><div className="mp-wrap"><div className="mp-goo"><div className="mp-a"/><div className="mp-b"/></div></div></W>
/* 7 */ const LavaBlobs     = () => <W><div className="lv-wrap"><div className="lv-goo"><div className="lv-a"/><div className="lv-b"/><div className="lv-c"/></div></div></W>
/* 8 */ const SquishSpin    = () => <W><div className="ss" /></W>
/* 9 */ const RippleBlob    = () => <W><div className="rb">{[0,1,2].map(i=><div key={i} className="rb-ring" style={{'--i':i}}/>)}</div></W>
/* 10 */ const InkSpread    = () => <W><div className="ik" /></W>
/* 11 */ const Worm         = () => <W><svg className="wm" viewBox="0 0 100 100"><circle className="wm-track" cx="50" cy="50" r="36" fill="none" stroke="#e0e0e0" strokeWidth="9" strokeLinecap="round"/><circle className="wm-head" cx="50" cy="50" r="36" fill="none" stroke="#111" strokeWidth="9" strokeLinecap="round" strokeDasharray="226" strokeDashoffset="0"/></svg></W>
/* 12 */ const BlobOrbit    = () => <W><div className="bo-wrap"><div className="bo-goo"><div className="bo-core"/><div className="bo-moon"/></div></div></W>
/* 13 */ const MetaBalls    = () => <W><div className="mb-wrap"><div className="mb-goo"><div className="mb-a"/><div className="mb-b"/><div className="mb-c"/></div></div></W>
/* 14 */ const JellyRing    = () => <W><div className="jr" /></W>
/* 15 */ const GravityBlob  = () => <W><div className="gv-wrap"><div className="gv-blob"/><div className="gv-shadow"/></div></W>
/* 16 */ const TearOrbit    = () => <W><div className="to-wrap">{[0,1,2,3,4].map(i=><div key={i} className="to-drop" style={{'--i':i}}/>)}</div></W>
/* 17 */ const SlimeWave    = () => <W><div className="sw-wrap"><div className="sw-goo"><div className="sw-body"/><div className="sw-drop" style={{'--i':0}}/><div className="sw-drop" style={{'--i':1}}/></div></div></W>
/* 18 */ const OrganicBars  = () => <W><div className="ob">{[0,1,2,3,4].map(i=><div key={i} className="ob-bar" style={{'--i':i}}/>)}</div></W>
/* 19 */ const CellDivide   = () => <W><div className="cd-wrap"><div className="cd-goo"><div className="cd-a"/><div className="cd-b"/></div></div></W>
/* 20 */ const NucleusCore  = () => <W><div className="nc"><div className="nc-core"/><div className="nc-ring r1"/><div className="nc-ring r2"/><div className="nc-blob nb1"/><div className="nc-blob nb2"/><div className="nc-blob nb3"/></div></W>

const loaders = [
  BlobPulse, Amoeba, GooRing, OozeDots, BreathBlob,
  MorphPair, LavaBlobs, SquishSpin, RippleBlob, InkSpread,
  Worm, BlobOrbit, MetaBalls, JellyRing, GravityBlob,
  TearOrbit, SlimeWave, OrganicBars, CellDivide, NucleusCore,
]

export default function LoadingShowcase() {
  return (
    <div className="lc-page">
      <div className="lc-grid">
        {loaders.map((C, i) => <C key={i} />)}
      </div>
    </div>
  )
}
