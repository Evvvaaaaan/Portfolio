import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useRef, useState, useMemo } from 'react'
import * as THREE from 'three'
import '../shared/exp.css'

const VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`

const FRAG = {
  plasma: `
    uniform float u_time; varying vec2 vUv;
    void main(){
      vec2 p=vUv*6.-3.;
      float v=sin(p.x+u_time)+sin(p.y+u_time*.7)+sin((p.x+p.y)*.5+u_time*1.3)+sin(length(p)+u_time);
      gl_FragColor=vec4(sin(v*3.14159)*.5+.5,sin(v*3.14159+2.094)*.5+.5,sin(v*3.14159+4.189)*.5+.5,1.);
    }`,
  noise: `
    uniform float u_time; uniform vec2 u_mouse; varying vec2 vUv;
    float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5);}
    float n(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
      return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}
    float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p*=2.1;a*=.5;}return v;}
    void main(){
      vec2 p=vUv+u_mouse*.08;
      float n1=fbm(p*3.+vec2(u_time*.2));
      float n2=fbm(p*5.-vec2(u_time*.15,u_time*.1));
      vec3 c=mix(vec3(.05,.02,.2),vec3(.3,.75,1.),n1);
      c=mix(c,vec3(.9,.4,.1),n2*.5);
      gl_FragColor=vec4(c,1.);
    }`,
  ripple: `
    uniform float u_time; uniform vec2 u_mouse; varying vec2 vUv;
    void main(){
      vec2 p=vUv-.5, m=u_mouse-.5;
      float d=length(p-m);
      float w=sin(d*50.-u_time*5.)*.5+.5;
      w*=smoothstep(.5,.0,d);
      float bg=sin(length(p)*25.-u_time*2.)*.3+.5;
      vec3 c=mix(vec3(.03,.03,.1),vec3(.1,.5,1.),bg);
      c=mix(c,vec3(1.,.85,.3),w*.9);
      gl_FragColor=vec4(c,1.);
    }`,
}

function ShaderScene({ preset }) {
  const matRef = useRef()
  const { viewport } = useThree()
  const uniforms = useMemo(() => ({
    u_time:  { value: 0 },
    u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
  }), [])

  useFrame(({ clock, pointer }) => {
    if (!matRef.current) return
    matRef.current.uniforms.u_time.value = clock.getElapsedTime()
    matRef.current.uniforms.u_mouse.value.set(pointer.x * .5 + .5, pointer.y * .5 + .5)
  })

  return (
    <mesh scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry />
      <shaderMaterial
        ref={matRef}
        key={preset}
        vertexShader={VERT}
        fragmentShader={FRAG[preset]}
        uniforms={uniforms}
      />
    </mesh>
  )
}

export default function ShaderPlayground() {
  const [preset, setPreset] = useState('plasma')
  return (
    <div className="exp-wrap">
      <Canvas orthographic camera={{ position: [0, 0, 1] }} style={{ background: '#0a0a0f' }}>
        <ShaderScene preset={preset} />
      </Canvas>
      <div className="exp-controls">
        {Object.keys(FRAG).map(k => (
          <button key={k} className={`exp-btn${preset===k?' active':''}`} onClick={() => setPreset(k)}>{k}</button>
        ))}
      </div>
    </div>
  )
}
