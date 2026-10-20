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
  const baseWidth = (cell - 4) * (1 + stretch - pressure * 0.12 + wobble);
  const x = 8 + cell * (Math.max(0, Math.min(2, position)) + 0.5);
  return {
    x,
    y: height / 2,
    width: Math.min(baseWidth, 2 * Math.min(x - 2, width - x - 2)),
    height: Math.min(
      height - 4,
      Math.min(56, height - 12) *
        (1 - stretch * 0.5 - pressure * 0.17 - wobble * 0.65),
    ),
  };
}
export const glassVertex = `attribute vec2 a_position; varying vec2 v_uv;
void main(){v_uv=(a_position+1.0)*.5;gl_Position=vec4(a_position,0.,1.);}`;
export const glassFragment = `precision mediump float;
uniform sampler2D u_text; uniform vec2 u_size; uniform vec4 u_lens;
uniform float u_energy; uniform float u_time; uniform vec3 u_backdrop; varying vec2 v_uv;
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
 vec2 refracted=p-n*edge*(2.2+u_energy*.5)+tangent*wrinkle*edge*(.35+u_energy*.65);
 float fringe=pow(1.-clamp(-d/5.,0.,1.),1.5);
 float dispersion=fringe*(.35+u_energy*.20);
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
 float whiteAlpha=.075;
 // Neutral lower bevel gives the clear surface thickness on pale backgrounds.
 float shade=exp(-abs(d+1.7)*1.4)*.12*(1.-clamp(-n.y,0.,1.));
 float rim=exp(-abs(d+.5)*2.2);
 float gleam=clamp(dot(n,normalize(vec2(-.6,-1.))),0.,1.);
 whiteAlpha+=rim*(.035+.12*gleam);
 float alpha=inkAlpha*(1.-whiteAlpha)+whiteAlpha;
 vec3 rgb=(ink*inkAlpha*(1.-whiteAlpha)+vec3(whiteAlpha))/max(alpha,.001);
 float bevelAlpha=shade*(1.-inkAlpha);
 rgb=(rgb*alpha*(1.-bevelAlpha)+vec3(.35,.39,.45)*bevelAlpha)/max(alpha*(1.-bevelAlpha)+bevelAlpha,.001);
 alpha=alpha*(1.-bevelAlpha)+bevelAlpha;
 vec4 glass=vec4(rgb,alpha);
 gl_FragColor=vec4(glass.rgb,glass.a*(1.-smoothstep(-.4,1.,d)));
}`;

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
