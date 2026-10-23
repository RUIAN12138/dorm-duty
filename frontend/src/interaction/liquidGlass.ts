export const GLASS_OVERFLOW = 16;
export function glassGeometry(
  width: number,
  height: number,
  position: number,
  pressure: number,
  velocity: number,
  wobble: number,
) {
  const cell = Math.max(1, (width - 16) / 3);
  const stretch = Math.min(0.18, Math.abs(velocity) * 0.018);
  const baseWidth = (cell - 4) * (1 + stretch + pressure * 0.22 + wobble);
  const x = 8 + cell * (Math.max(0, Math.min(2, position)) + 0.5);
  return {
    x,
    y: height / 2,
    width: Math.min(
      baseWidth,
      2 * Math.min(x + GLASS_OVERFLOW - 2, width + GLASS_OVERFLOW - x - 2),
    ),
    height: Math.min(
      height + GLASS_OVERFLOW,
      Math.min(56, height - 12) *
        (1 - stretch * 0.15 + pressure * 0.42 - wobble * 0.3),
    ),
  };
}
export const glassVertex = `attribute vec2 a_position; varying vec2 v_uv;
void main(){v_uv=(a_position+1.0)*.5;gl_Position=vec4(a_position,0.,1.);}`;
export const glassFragment = `precision mediump float;
uniform sampler2D u_text; uniform vec2 u_size; uniform vec4 u_lens;
uniform float u_energy; uniform float u_zoom; uniform float u_time; uniform vec3 u_backdrop; uniform vec4 u_tint; varying vec2 v_uv;
float shape(vec2 p){
 vec2 halfSize=u_lens.zw*.5; float radius=min(halfSize.x,halfSize.y)*.97;
 vec2 q=abs(p-u_lens.xy)-halfSize+radius;
 float d=length(max(q,0.))+min(max(q.x,q.y),0.)-radius;
 float wrinkle=sin((p.x-u_lens.x)*.16+u_time*3.)*sin((p.y-u_lens.y)*.2-u_time*2.);
 return d+wrinkle*u_energy*.65*exp(-abs(d)*.15);
}
vec4 sampleText(vec2 p){return texture2D(u_text,vec2(p.x/u_size.x,1.-p.y/u_size.y));}
void main(){
 vec2 p=vec2(v_uv.x,1.-v_uv.y)*u_size;
 float d=shape(p);
 if(d>1.2){gl_FragColor=vec4(0.);return;}
 vec2 n=normalize(vec2(shape(p+vec2(.6,0.))-shape(p-vec2(.6,0.)),shape(p+vec2(0.,.6))-shape(p-vec2(0.,.6)))+vec2(.0001));
 float edge=pow(1.-clamp(-d/5.,0.,1.),2.);
 // Curvature and wrinkles bend the image, not a decorative coloured border.
 float wrinkle=sin((p.x-u_lens.x)*.19+u_time*2.7)*sin((p.y-u_lens.y)*.16-u_time*1.9);
 vec2 tangent=vec2(-n.y,n.x);
 vec2 enlarged=u_lens.xy+(p-u_lens.xy)/u_zoom;
 vec2 refracted=enlarged-n*edge*(2.2+u_energy*.5)+tangent*wrinkle*edge*(.35+u_energy*.65);
 float fringe=pow(1.-clamp(-d/5.,0.,1.),1.5);
 float dispersion=fringe*(.80+u_energy*.50);
 float spread=fringe*.16;
 vec4 red=sampleText(refracted+n*dispersion)*.76;
 red+=(sampleText(refracted+n*dispersion+tangent*spread)+sampleText(refracted+n*dispersion-tangent*spread))*.12;
 vec4 green=sampleText(refracted)*.76;
 green+=(sampleText(refracted+tangent*spread)+sampleText(refracted-tangent*spread))*.12;
 vec4 blue=sampleText(refracted-n*dispersion)*.76;
 blue+=(sampleText(refracted-n*dispersion+tangent*spread)+sampleText(refracted-n*dispersion-tangent*spread))*.12;
 // Black ink has no RGB energy of its own. Each wavelength must transmit its
 // own uncovered portion of the backdrop, or shifting black still stays black.
 vec3 coverage=vec3(red.a,green.a,blue.a);
 float inkAlpha=max(coverage.r,max(coverage.g,coverage.b));
 vec3 inkPremul=vec3(red.r,green.g,blue.b)+u_backdrop*(vec3(inkAlpha)-coverage);
 vec3 ink=inkPremul/max(inkAlpha,.001);
 float luma=dot(ink,vec3(.2126,.7152,.0722));
 ink=clamp(mix(vec3(luma),ink,1.35),0.,1.);
 // A 10% white overlay is local to the lens. No page-wide dimming or rainbow.
 float whiteAlpha=u_tint.a*.70;
 // Neutral lower bevel gives the clear surface thickness on pale backgrounds.
 float shade=exp(-abs(d+1.7)*1.4)*.12*(1.-clamp(-n.y,0.,1.));
 float rim=exp(-abs(d+.5)*2.2);
 float gleam=clamp(dot(n,normalize(vec2(-.6,-1.))),0.,1.);
 whiteAlpha+=rim*(.035+.12*gleam);
 // The tint is behind the label, not a veil over it. Opaque glyphs stay
 // fully readable in dark mode even when the glass itself is dark/dense.
 float alpha=inkAlpha+whiteAlpha*(1.-inkAlpha);
 vec3 rgb=(ink*inkAlpha+u_tint.rgb*whiteAlpha*(1.-inkAlpha))/max(alpha,.001);
 float bevelAlpha=shade*(1.-inkAlpha);
 rgb=(rgb*alpha*(1.-bevelAlpha)+vec3(.35,.39,.45)*bevelAlpha)/max(alpha*(1.-bevelAlpha)+bevelAlpha,.001);
 alpha=alpha*(1.-bevelAlpha)+bevelAlpha;
 vec4 glass=vec4(rgb,alpha);
 gl_FragColor=vec4(glass.rgb,glass.a*(1.-smoothstep(-.4,1.,d)));
}`;

// Opt-in variant used only by the bottom navigation. The default shader above
// stays untouched because AppearanceSettings shares this renderer.
// Principles adapted from rdev/liquid-glass-react (MIT); see glassOptics.ts and
// /licenses/liquid-glass-react-MIT.txt. No library code is copied.
export const glassFragmentOptical = `precision mediump float;
uniform sampler2D u_text; uniform vec2 u_size; uniform vec4 u_lens;
uniform float u_energy; uniform float u_zoom; uniform float u_time; uniform vec3 u_backdrop; uniform vec4 u_tint; varying vec2 v_uv;
float shape(vec2 p){
 vec2 halfSize=u_lens.zw*.5; float radius=min(halfSize.x,halfSize.y)*.97;
 vec2 q=abs(p-u_lens.xy)-halfSize+radius;
 float d=length(max(q,0.))+min(max(q.x,q.y),0.)-radius;
 float wrinkle=sin((p.x-u_lens.x)*.16+u_time*3.)*sin((p.y-u_lens.y)*.2-u_time*2.);
 return d+wrinkle*u_energy*.65*exp(-abs(d)*.15);
}
vec4 sampleText(vec2 p){return texture2D(u_text,vec2(p.x/u_size.x,1.-p.y/u_size.y));}
void main(){
 vec2 p=vec2(v_uv.x,1.-v_uv.y)*u_size;
 float d=shape(p);
 if(d>1.2){gl_FragColor=vec4(0.);return;}
 vec2 n=normalize(vec2(shape(p+vec2(.6,0.))-shape(p-vec2(.6,0.)),shape(p+vec2(0.,.6))-shape(p-vec2(0.,.6)))+vec2(.0001));
 float edge=pow(1.-clamp(-d/5.,0.,1.),2.);
 // Curvature and wrinkles bend the image, not a decorative coloured border.
 // The optical pass adds a slightly wider SDF bend near the rim while the
 // centre stays untouched.
 float wrinkle=sin((p.x-u_lens.x)*.19+u_time*2.7)*sin((p.y-u_lens.y)*.16-u_time*1.9);
 vec2 tangent=vec2(-n.y,n.x);
 vec2 enlarged=u_lens.xy+(p-u_lens.xy)/u_zoom;
 vec2 refracted=enlarged-n*edge*(2.45+u_energy*.45)+tangent*wrinkle*edge*(.32+u_energy*.55);
 // Fine per-channel fringe. Each channel moves at most .72px from the common
 // sample, so red/blue separation stays below 1.5px: no rainbow outline.
 float fringe=pow(1.-clamp(-d/5.,0.,1.),1.5);
 float dispersion=min(.72,fringe*(.52+u_energy*.24));
 float spread=min(.22,fringe*.12);
 vec4 red=sampleText(refracted+n*dispersion)*.76;
 red+=(sampleText(refracted+n*dispersion+tangent*spread)+sampleText(refracted+n*dispersion-tangent*spread))*.12;
 vec4 green=sampleText(refracted)*.76;
 green+=(sampleText(refracted+tangent*spread)+sampleText(refracted-tangent*spread))*.12;
 vec4 blue=sampleText(refracted-n*dispersion)*.76;
 blue+=(sampleText(refracted-n*dispersion+tangent*spread)+sampleText(refracted-n*dispersion-tangent*spread))*.12;
 // Black ink has no RGB energy of its own. Each wavelength must transmit its
 // own uncovered portion of the backdrop, or shifting black still stays black.
 vec3 coverage=vec3(red.a,green.a,blue.a);
 float inkAlpha=max(coverage.r,max(coverage.g,coverage.b));
 vec3 inkPremul=vec3(red.r,green.g,blue.b)+u_backdrop*(vec3(inkAlpha)-coverage);
 vec3 ink=inkPremul/max(inkAlpha,.001);
 float luma=dot(ink,vec3(.2126,.7152,.0722));
 ink=clamp(mix(vec3(luma),ink,1.35),0.,1.);
 // A small local white overlay keeps glyphs readable. The bevel is about one
 // pixel and the highlight follows one fixed light direction, using only the
 // existing pressure/velocity energy already supplied by the lens spring.
 float whiteAlpha=u_tint.a*.70;
 float shade=exp(-abs(d+1.7)*1.4)*.12*(1.-clamp(-n.y,0.,1.));
 float bevel=exp(-abs(d+1.0)*1.9);
 float rim=exp(-abs(d+.45)*2.6);
 float gleam=clamp(dot(n,normalize(vec2(-.55,-.9))),0.,1.);
 whiteAlpha+=bevel*(.012+.04*u_energy)+rim*(.028+.075*gleam);
 float alpha=inkAlpha+whiteAlpha*(1.-inkAlpha);
 vec3 rgb=(ink*inkAlpha+u_tint.rgb*whiteAlpha*(1.-inkAlpha))/max(alpha,.001);
 float bevelAlpha=shade*(1.-inkAlpha);
 rgb=(rgb*alpha*(1.-bevelAlpha)+vec3(.35,.39,.45)*bevelAlpha)/max(alpha*(1.-bevelAlpha)+bevelAlpha,.001);
 alpha=alpha*(1.-bevelAlpha)+bevelAlpha;
 vec4 glass=vec4(rgb,alpha);
 gl_FragColor=vec4(glass.rgb,glass.a*(1.-smoothstep(-.4,1.,d)));
}`;
export function glassFragmentSource(optical = false) {
  return optical ? glassFragmentOptical : glassFragment;
}
export interface NativeLabelBox {
  left: number;
  top: number;
  width: number;
  height: number;
}
// Cut only the current lens out of native labels. Uncovered labels use no clip.
export function nativeGlassClip(
  box: NativeLabelBox,
  lens: { x: number; y: number; width: number; height: number },
) {
  const left = lens.x - lens.width / 2,
    right = lens.x + lens.width / 2;
  const top = lens.y - lens.height / 2,
    bottom = lens.y + lens.height / 2;
  if (
    right <= box.left ||
    left >= box.left + box.width ||
    bottom <= box.top ||
    top >= box.top + box.height
  )
    return "none";
  const radius = Math.min(lens.width, lens.height) * 0.5 * 0.97;
  const points: string[] = [];
  const point = (x: number, y: number) =>
    `${(x - box.left).toFixed(3)}px ${(y - box.top).toFixed(3)}px`;
  for (const [x, y, start] of [
    [right - radius, top + radius, -90],
    [right - radius, bottom - radius, 0],
    [left + radius, bottom - radius, 90],
    [left + radius, top + radius, 180],
  ]) {
    for (let step = 0; step <= 8; step++) {
      const angle = ((start + (step * 90) / 8) * Math.PI) / 180;
      points.push(
        point(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius),
      );
    }
  }
  return `polygon(evenodd,0px 0px,${box.width}px 0px,${box.width}px ${box.height}px,0px ${box.height}px,0px 0px,${points.join(",")},${points[0]},0px 0px)`;
}
