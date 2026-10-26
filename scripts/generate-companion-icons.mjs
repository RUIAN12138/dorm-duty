// User-selected artwork: preserve composition and colours; raster-size export only.
import { chromium } from '../frontend/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs/promises';
const source=await fs.readFile('docs/icon-source/user-selected.png');
const b=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const p=await b.newPage();
 const targets=[['frontend/public/icon-192.png',192],['frontend/public/icon-512.png',512],['frontend/public/icon-maskable.png',512],['frontend/public/apple-touch-icon.png',180],['native/android/app/src/main/res/drawable/app_icon.png',512],['native/android/app/src/main/res/drawable/companion_foreground.png',512],['native/harmony/AppScope/resources/base/media/app_icon.png',512],...['light','dark','mono','adaptive'].map(n=>[`frontend/public/icon-${n}.png`,512])];
 for(const [file,size] of targets){
  const result=await p.evaluate(async({data,size})=>{
   const image=new Image();image.src=data;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
   const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,size,size);
   return canvas.toDataURL('image/png').split(',')[1];
  },{data:`data:image/png;base64,${source.toString('base64')}`,size});
  await fs.writeFile(file,Buffer.from(result,'base64'));
 }
 const png=await fs.readFile('frontend/public/icon-512.png');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/png;base64,${png.toString('base64')}"/></svg>`;
 for(const name of ['icon','icon-light','icon-dark','icon-mono','icon-adaptive'])await fs.writeFile(`frontend/public/${name}.svg`,svg);
 console.log('11 PNG exports and 5 SVG wrappers generated from supplied artwork; no colour or geometry edits.');
}finally{await b.close()}
