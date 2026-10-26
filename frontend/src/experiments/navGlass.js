// Opt-in experiment only. Never imported by the normal application entry.
// Low-level upstream MIT renderer; one context, static backdrop, no idle loop.
import { LiquidGlassWebGL } from './glass-upstream/index.js';
export function mountNavGlass(nav, backdrop) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return { mode:'css', destroy() {} };
  const canvas=document.createElement('canvas');
  canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;border-radius:inherit';
  let glass, frames=0, queued=0, pressed=false;
  const width=nav.clientWidth,height=nav.clientHeight;
  try {
    canvas.width=width;canvas.height=height;
    glass=new LiquidGlassWebGL(canvas,{compositeMode:'overlay'});
    glass.setBackdrop(backdrop,{update:'static'});
    nav.prepend(canvas);
    const draw=()=>{queued=0;if(document.hidden)return;try {
      glass.setElements([{id:'nav',shape:'pill',x:0,y:0,width,height,tint:.08,pressure:pressed?.25:0}]);
      glass.render();frames++;
    } catch {destroy()} };
    const schedule=()=>{if(!queued)queued=requestAnimationFrame(draw)};
    const down=()=>{pressed=true;schedule()};const up=()=>{pressed=false;schedule()};
    const lost=e=>{e.preventDefault();destroy()};
    function destroy(){cancelAnimationFrame(queued);nav.removeEventListener('pointerdown',down);window.removeEventListener('pointerup',up);canvas.removeEventListener('webglcontextlost',lost);glass?.destroy();canvas.remove()}
    nav.addEventListener('pointerdown',down);window.addEventListener('pointerup',up);canvas.addEventListener('webglcontextlost',lost);draw();
    return {mode:'webgl',canvas,get frames(){return frames},destroy};
  } catch {glass?.destroy();canvas.remove();return {mode:'css',frames:0,destroy(){}}}
}
