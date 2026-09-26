
const whiteFlowerSrc='./assets/white-flower.jpg';
const $=selector=>document.querySelector(selector);
const main=$('#main'),mctx=main.getContext('2d');
const source=document.createElement('canvas'),srcCtx=source.getContext('2d');
const sampleSource=document.createElement('canvas'),sampleCtx=sampleSource.getContext('2d');
const zoneCanvas=document.createElement('canvas'),zctx=zoneCanvas.getContext('2d');
const mixCanvas=document.createElement('canvas'),mixCtx=mixCanvas.getContext('2d',{willReadFrequently:true});
const previousZoneCanvas=document.createElement('canvas'),previousZoneCtx=previousZoneCanvas.getContext('2d',{willReadFrequently:true});
const accCanvas=document.createElement('canvas'),accCtx=accCanvas.getContext('2d');
const frameCanvas=document.createElement('canvas'),frameCtx=frameCanvas.getContext('2d',{willReadFrequently:true});
const processedCanvas=document.createElement('canvas'),processedCtx=processedCanvas.getContext('2d');
const previewSurface={source,srcCtx,sampleSource,sampleCtx,zoneCanvas,zctx,mixCanvas,mixCtx,previousZoneCanvas,previousZoneCtx,accCanvas,accCtx,frameCanvas,frameCtx,samplePadX:0,samplePadY:0};
function createRenderSurface(){
  const make=(readOften=false)=>{const canvas=document.createElement('canvas');return [canvas,canvas.getContext('2d',readOften?{willReadFrequently:true}:undefined)];};
  const [source,srcCtx]=make(),[sampleSource,sampleCtx]=make(),[zoneCanvas,zctx]=make(),[mixCanvas,mixCtx]=make(true);
  const [previousZoneCanvas,previousZoneCtx]=make(true),[accCanvas,accCtx]=make(),[frameCanvas,frameCtx]=make(true);
  return {source,srcCtx,sampleSource,sampleCtx,zoneCanvas,zctx,mixCanvas,mixCtx,previousZoneCanvas,previousZoneCtx,accCanvas,accCtx,frameCanvas,frameCtx,samplePadX:0,samplePadY:0};
}
const exportSurface=createRenderSurface();
const stage=$('#stage'),centerEl=$('#center'),stageWrap=$('#stageWrap'),statusEl=$('#status');
const direction=1,FOCUS_K=10,lab={k:FOCUS_K,zones:28,overlap:3,blend:'CROSSFADE',focus:50};
const MOBILE_PREVIEW_MAX_SIDE=420,LARGE_PREVIEW_MAX_SIDE=600;
const PREVIEW_TARGET_STEP=1.6,PREVIEW_SAMPLE_CAP=128;
const EXPORT_MAX_SIDE=1200,EXPORT_TARGET_STEP=2.4,EXPORT_SAMPLE_CAP=128;
const DEBUG=false;
const state={cx:.5,cy:.5,angle:12};
const presets={light:{angle:6,focus:35},standard:{angle:12,focus:50},vortex:{angle:24,focus:60}};
let activePreset='standard';
let sourceType='demo',img=null,sourceNaturalWidth=0,sourceNaturalHeight=0,raf=0,hiTimer=0,showingOriginal=false,revision=0,imageRequestId=0,hqReady=-1,activeHQ=null,hqExportId=0,exportRunning=false;
function getRenderMode(){return sourceType==='grid'||sourceType==='dot'?'GEOMETRY_HQ':'HQ_LINEAR';}
function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
function sigmoid(x){ return 1/(1+Math.exp(-x)); }
// Product Focus Control: broad 0.07→0.55 breakpoint range, tuned from the preferred V3 behavior.
function focusToBreakpoint(focus){return 0.07+0.48*(clamp(focus,0,100)/100);}
function activeBreakpoint(){return focusToBreakpoint(lab.focus);}
// Focus=0 truly disables center protection and applies the full angle everywhere.
function radialAngleScale(u,focus,k){
  if(focus<=0)return 1;
  const b=focusToBreakpoint(focus),s0=sigmoid(-k*b),s1=sigmoid(k*(1-b)),su=sigmoid(k*(u-b));
  return clamp((su-s0)/(s1-s0),0,1);
}

function fitSize(w,h,maxSide=760){ const s=Math.min(1,maxSide/Math.max(w,h)); return [Math.max(1,Math.round(w*s)), Math.max(1,Math.round(h*s))]; }
function prepareSampleSource(surface,w,h){
  // Keep a small edge-pixel guard for subpixel filtering; Auto Overscan covers the frame.
  const {source,sampleSource,sampleCtx}=surface,pad=2;
  surface.samplePadX=pad;surface.samplePadY=pad;
  sampleSource.width=w+pad*2;sampleSource.height=h+pad*2;
  sampleCtx.drawImage(source,pad,pad);
  sampleCtx.drawImage(source,0,0,w,1,pad,0,w,pad);
  sampleCtx.drawImage(source,0,h-1,w,1,pad,pad+h,w,pad);
  sampleCtx.drawImage(source,0,0,1,h,0,pad,pad,h);
  sampleCtx.drawImage(source,w-1,0,1,h,pad+w,pad,pad,h);
  sampleCtx.drawImage(source,0,0,1,1,0,0,pad,pad);
  sampleCtx.drawImage(source,w-1,0,1,1,pad+w,0,pad,pad);
  sampleCtx.drawImage(source,0,h-1,1,1,0,pad+h,pad,pad);
  sampleCtx.drawImage(source,w-1,h-1,1,1,pad+w,pad+h,pad,pad);
}
function setBusy(v){stageWrap.classList.toggle('busy',!!v);}
function updateCenter(){ centerEl.style.left=(state.cx*100)+'%'; centerEl.style.top=(state.cy*100)+'%'; }
function clipAnnulus(ctx,cx,cy,r0,r1){ ctx.beginPath(); ctx.arc(cx,cy,r1,0,Math.PI*2); if(r0>0){ ctx.moveTo(cx+r0,cy); ctx.arc(cx,cy,r0,0,Math.PI*2,true); } ctx.clip(); }
function autoOverscan(w,h,cx,cy,maxDeg){
  const half=Math.abs(maxDeg)*Math.PI/360,mx=w/2,my=h/2;
  let zoom=1;
  for(const [px,py] of [[0,0],[w,0],[0,h],[w,h]]){
    const a=px-cx,b=py-cy,angles=[-half,0,half];
    // Each inverse-coordinate is a sinusoid; include its extrema inside the shutter interval.
    for(const phase of [Math.atan2(b,a),Math.atan2(-a,b)]){
      for(let k=-1;k<=1;k++){
        const theta=phase+k*Math.PI;
        if(theta>-half&&theta<half)angles.push(theta);
      }
    }
    for(const theta of angles){
      const cos=Math.cos(theta),sin=Math.sin(theta);
      const dx=cos*a+sin*b-(mx-cx),dy=-sin*a+cos*b-(my-cy);
      zoom=Math.max(zoom,Math.abs(dx)/mx,Math.abs(dy)/my);
    }
  }
  return zoom;
}
function drawSample(ctx,g,theta,surface){
  ctx.translate(g.cx,g.cy);ctx.rotate(theta);ctx.translate(-g.cx,-g.cy);
  ctx.translate(g.w/2,g.h/2);ctx.scale(g.zoom,g.zoom);ctx.translate(-g.w/2,-g.h/2);
  ctx.drawImage(surface.sampleSource,-surface.samplePadX,-surface.samplePadY);
}
function adaptiveBaseStats(w,h,cx,cy,totalDeg){
  const rMax=Math.max(Math.hypot(cx,cy), Math.hypot(w-cx,cy), Math.hypot(cx,h-cy), Math.hypot(w-cx,h-cy));
  const angleRad=Math.abs(totalDeg)*Math.PI/180, path=rMax*angleRad; return {rMax, path};
}
function exposureSamples(N,totalDeg){
  const samples=[];
  for(let i=0;i<N;i++){
    const t=N===1?0.5:i/(N-1);
    samples.push({theta:-totalDeg/2+totalDeg*t,w:1/N});
  }
  return samples;
}
function srgbToLinear(v){ v/=255; return v<=0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }
function linearToSrgb(v){ v=clamp(v,0,1); return Math.round(255*(v<=0.0031308 ? 12.92*v : 1.055*Math.pow(v,1/2.4)-0.055)); }
const srgbToLinearLUT=Float32Array.from({length:256},(_,i)=>srgbToLinear(i));
function computeZoneAngle(u,totalDeg){
  const edgeSoft=1-0.08*Math.pow(clamp((Math.abs(totalDeg)-28)/32,0,1),1.15)*Math.pow(u,1.4);
  return totalDeg*radialAngleScale(u,lab.focus,lab.k)*edgeSoft;
}
function adaptiveSamplesForZone(r1,localDeg,config){
  const path=r1*Math.abs(localDeg)*Math.PI/180;
  const requested=Math.abs(localDeg)<0.03?1:Math.max(3,Math.ceil(path/config.targetStep)+1);
  const count=Math.min(requested,config.sampleCap);
  return {count,requested,capped:requested>count,step:count>1?path/(count-1):0};
}
function getPreviewRenderConfig(low){return {w:main.width,h:main.height,zones:low?14:lab.zones,overlap:lab.overlap,blend:low?'HARD':lab.blend,targetStep:low?4.2:PREVIEW_TARGET_STEP,sampleCap:low?24:PREVIEW_SAMPLE_CAP,renderMode:'HQ_LINEAR',low};}
function getExportRenderConfig(){
  const previewMax=Math.max(main.width,main.height);
  const scale=Math.min(1,EXPORT_MAX_SIDE/Math.max(sourceNaturalWidth,sourceNaturalHeight));
  const w=Math.max(1,Math.round(sourceNaturalWidth*scale)),h=Math.max(1,Math.round(sourceNaturalHeight*scale));
  const exportMax=Math.max(w,h),renderMode=getRenderMode();
  return {w,h,zones:lab.zones,overlap:lab.overlap*exportMax/previewMax,blend:lab.blend,targetStep:renderMode==='GEOMETRY_HQ'?2.0:EXPORT_TARGET_STEP,sampleCap:renderMode==='GEOMETRY_HQ'?512:EXPORT_SAMPLE_CAP,renderMode,low:false};
}
function zoneGeometry(config){
  const {w,h,zones,overlap,blend}=config,cx=state.cx*w,cy=state.cy*h,totalDeg=state.angle*direction;
  const {rMax}=adaptiveBaseStats(w,h,cx,cy,totalDeg);
  // A fixed crop for a given angle keeps b, k and zone comparisons framed identically.
  const zoom=autoOverscan(w,h,cx,cy,totalDeg);
  const specs=[];let minN=Infinity,maxN=0,totalN=0,worstStep=0,cappedZones=0;
  for(let j=0;j<zones;j++){
    const r0=j/zones*rMax,r1=(j+1)/zones*rMax,u=(j+0.5)/zones,localDeg=computeZoneAngle(u,totalDeg);
    const base={r0,r1,inner:Math.max(0,r0-overlap),outer:Math.min(rMax,r1+overlap),localDeg};
    if(blend==='CROSSFADE'){
      const localDeg0=computeZoneAngle(j/zones,totalDeg),localDeg1=computeZoneAngle((j+1)/zones,totalDeg);
      const first=adaptiveSamplesForZone(r1,localDeg0,config),second=adaptiveSamplesForZone(r1,localDeg1,config);
      specs.push(Object.assign({},base,{localDeg0,localDeg1,N0:first.count,N1:second.count,N:first.count+second.count}));
      minN=Math.min(minN,first.count,second.count);maxN=Math.max(maxN,first.count,second.count);
      totalN+=first.count+second.count;worstStep=Math.max(worstStep,first.step,second.step);if(first.capped||second.capped)cappedZones++;
    }else{
      const sample=adaptiveSamplesForZone(r1,localDeg,config);
      specs.push(Object.assign({},base,{N:sample.count}));
      minN=Math.min(minN,sample.count);maxN=Math.max(maxN,sample.count);totalN+=sample.count;worstStep=Math.max(worstStep,sample.step);if(sample.capped)cappedZones++;
    }
  }
  return {w,h,cx,cy,rMax,zones,overlap,blend,specs,minN,maxN,totalN,worstStep,cappedZones,sampleCap:config.sampleCap,targetStep:config.targetStep,renderMode:config.renderMode,zoom,low:config.low};
}
function renderFastZone(targetCtx,g,spec,surface){
  targetCtx.setTransform(1,0,0,1,0,0); targetCtx.globalCompositeOperation='source-over'; targetCtx.globalAlpha=1; targetCtx.clearRect(0,0,g.w,g.h);
  const samples=exposureSamples(spec.N,spec.localDeg); let cum=0;
  for(const o of samples){
    const alpha = cum===0 ? 1 : o.w / (cum + o.w);
    targetCtx.save();
    targetCtx.globalAlpha = alpha;
    drawSample(targetCtx,g,o.theta*Math.PI/180,surface);
    targetCtx.restore(); cum += o.w;
  }
}
function copyCurrentZoneToMix(surface,g){
  surface.mixCtx.setTransform(1,0,0,1,0,0);
  surface.mixCtx.clearRect(0,0,g.w,g.h);
  surface.mixCtx.drawImage(surface.zoneCanvas,0,0);
}
function blendRadialZone(surface,g,spec,targetCtx=surface.zctx){
  const {zctx,mixCtx}=surface;
  const x0=Math.max(0,Math.floor(g.cx-spec.outer)),y0=Math.max(0,Math.floor(g.cy-spec.outer));
  const x1=Math.min(g.w,Math.ceil(g.cx+spec.outer)),y1=Math.min(g.h,Math.ceil(g.cy+spec.outer));
  const bw=x1-x0,bh=y1-y0,first=mixCtx.getImageData(x0,y0,bw,bh).data;
  const second=zctx.getImageData(x0,y0,bw,bh).data,out=zctx.createImageData(bw,bh),data=out.data;
  for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){
    const radius=Math.hypot(x0+x+.5-g.cx,y0+y+.5-g.cy);
    if(radius<spec.inner||radius>spec.outer)continue;
    const p=(y*bw+x)*4,t=clamp((radius-spec.r0)/(spec.r1-spec.r0),0,1);
    const weight0=(1-t)*first[p+3]/255,weight1=t*second[p+3]/255,alpha=weight0+weight1;
    if(alpha<=0)continue;
    for(let channel=0;channel<3;channel++){
      if(g.renderMode==='GEOMETRY_HQ'||g.low)data[p+channel]=Math.round((first[p+channel]*weight0+second[p+channel]*weight1)/alpha);
      else{
        const a=srgbToLinearLUT[first[p+channel]],b=srgbToLinearLUT[second[p+channel]];
        data[p+channel]=linearToSrgb((a*weight0+b*weight1)/alpha);
      }
    }
    data[p+3]=Math.round(alpha*255);
  }
  targetCtx.clearRect(0,0,g.w,g.h);targetCtx.putImageData(out,x0,y0);
}
function yieldToUI(){return new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));}
async function renderGeometryZone(surface,g,spec,isCurrent,onSample){
  const ctx=surface.zctx;
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,g.w,g.h);
  ctx.save();clipAnnulus(ctx,g.cx,g.cy,spec.inner,spec.outer);ctx.globalCompositeOperation='lighter';
  try{
    let sampleIndex=0;
    for(const sample of exposureSamples(spec.N,spec.localDeg)){
      if(!isCurrent())return false;
      ctx.save();ctx.globalAlpha=sample.w;drawSample(ctx,g,sample.theta*Math.PI/180,surface);ctx.restore();
      if(onSample)onSample();
      if(++sampleIndex%16===0){await yieldToUI();if(!isCurrent())return false;}
    }
    return isCurrent();
  }finally{ctx.restore();}
}
async function renderLinearZone(surface,g,spec,isCurrent,onSample){
  const {frameCtx,zctx}=surface;
  const {w,h,cx,cy}=g,{inner,outer,localDeg,N}=spec;
  const x0=Math.max(0,Math.floor(cx-outer)),y0=Math.max(0,Math.floor(cy-outer));
  const x1=Math.min(w,Math.ceil(cx+outer)),y1=Math.min(h,Math.ceil(cy+outer));
  const bw=x1-x0,bh=y1-y0,size=bw*bh;
  const active=new Uint32Array(size);let activeCount=0;
  const inner2=inner*inner,outer2=outer*outer;
  for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){
    const dx=x0+x+0.5-cx,dy=y0+y+0.5-cy,r2=dx*dx+dy*dy;
    if(r2>=inner2&&r2<=outer2)active[activeCount++]=y*bw+x;
  }
  const sums=new Float32Array(size*3),samples=exposureSamples(N,localDeg);
  // Exposure integrates light energy. Decode every rendered frame before weighting;
  // converting a finished sRGB blend would leave the original gamma-space error intact.
  let sampleIndex=0;
  for(const sample of samples){
    if(!isCurrent())return false;
    frameCtx.setTransform(1,0,0,1,0,0);frameCtx.clearRect(x0,y0,bw,bh);
    frameCtx.save();frameCtx.beginPath();frameCtx.rect(x0,y0,bw,bh);frameCtx.clip();
    drawSample(frameCtx,g,sample.theta*Math.PI/180,surface);frameCtx.restore();
    const pixels=frameCtx.getImageData(x0,y0,bw,bh).data;
    for(let k=0;k<activeCount;k++){
      const idx=active[k],p=idx*4,q=idx*3;
      const r=srgbToLinearLUT[pixels[p]],gg=srgbToLinearLUT[pixels[p+1]],b=srgbToLinearLUT[pixels[p+2]];
      sums[q]+=r*sample.w;sums[q+1]+=gg*sample.w;sums[q+2]+=b*sample.w;
    }
    if(onSample)onSample();
    sampleIndex++;
    if(onSample&&sampleIndex%4===0){await yieldToUI();if(!isCurrent())return false;}
    else if(!onSample&&sampleIndex%12===0){await new Promise(resolve=>setTimeout(resolve,0));if(!isCurrent())return false;}
  }
  const out=zctx.createImageData(bw,bh),data=out.data;
  for(let k=0;k<activeCount;k++){
    const idx=active[k],p=idx*4,q=idx*3;
    data[p]=linearToSrgb(sums[q]);data[p+1]=linearToSrgb(sums[q+1]);data[p+2]=linearToSrgb(sums[q+2]);data[p+3]=255;
  }
  zctx.clearRect(0,0,w,h);
  zctx.putImageData(out,x0,y0);
  return true;
}
function blendZoneBoundary(surface,g,radius,halfWidth){
  const {previousZoneCtx,zctx,accCtx}=surface;
  const outer=radius+halfWidth,x0=Math.max(0,Math.floor(g.cx-outer)),y0=Math.max(0,Math.floor(g.cy-outer));
  const x1=Math.min(g.w,Math.ceil(g.cx+outer)),y1=Math.min(g.h,Math.ceil(g.cy+outer));
  const bw=x1-x0,bh=y1-y0;
  const previous=previousZoneCtx.getImageData(x0,y0,bw,bh).data;
  const current=zctx.getImageData(x0,y0,bw,bh).data;
  const result=accCtx.getImageData(x0,y0,bw,bh),data=result.data;
  for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){
    const distance=Math.hypot(x0+x+0.5-g.cx,y0+y+0.5-g.cy);
    if(distance<radius-halfWidth||distance>radius+halfWidth)continue;
    const p=(y*bw+x)*4,t=clamp((distance-radius+halfWidth)/(halfWidth*2),0,1);
    if(previous[p+3]!==255||current[p+3]!==255)continue;
    for(let channel=0;channel<3;channel++){
      if(g.renderMode==='GEOMETRY_HQ')data[p+channel]=Math.round(previous[p+channel]*(1-t)+current[p+channel]*t);
      else{
        const a=srgbToLinearLUT[previous[p+channel]],b=srgbToLinearLUT[current[p+channel]];
        data[p+channel]=linearToSrgb(a*(1-t)+b*t);
      }
    }
    data[p+3]=255;
  }
  accCtx.putImageData(result,x0,y0);
}
function composeZone(surface,g,spec,index){
  const {accCtx,zoneCanvas,previousZoneCtx}=surface;
  accCtx.save();clipAnnulus(accCtx,g.cx,g.cy,spec.r0,spec.r1);accCtx.drawImage(zoneCanvas,0,0);accCtx.restore();
  if(index>0&&g.overlap>0)blendZoneBoundary(surface,g,spec.r0,Math.max(0.5,g.overlap-0.5));
  previousZoneCtx.setTransform(1,0,0,1,0,0);previousZoneCtx.clearRect(0,0,g.w,g.h);previousZoneCtx.drawImage(zoneCanvas,0,0);
}
async function renderZone(surface,g,spec,isCurrent,index,renderMode='HQ_LINEAR',onSample=null){
  const renderPass=pass=>renderMode==='GEOMETRY_HQ'
    ?renderGeometryZone(surface,g,pass,isCurrent,onSample)
    :renderLinearZone(surface,g,pass,isCurrent,onSample);
  if(g.blend==='CROSSFADE'){
    if(!await renderPass(Object.assign({},spec,{localDeg:spec.localDeg0,N:spec.N0})))return false;
    copyCurrentZoneToMix(surface,g);
    await yieldToUI();if(!isCurrent())return false;
    if(!await renderPass(Object.assign({},spec,{localDeg:spec.localDeg1,N:spec.N1})))return false;
    blendRadialZone(surface,g,spec);
  }else if(!await renderPass(spec))return false;
  if(!isCurrent())return false;composeZone(surface,g,spec,index);return true;
}
function clearAccumulation(surface,g){const ctx=surface.accCtx;ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle='#fff';ctx.fillRect(0,0,g.w,g.h);}
function displayCanvas(canvas){mctx.setTransform(1,0,0,1,0,0);mctx.globalAlpha=1;mctx.globalCompositeOperation='source-over';mctx.clearRect(0,0,main.width,main.height);mctx.drawImage(canvas,0,0);}
function showCurrent(){displayCanvas(showingOriginal?source:processedCanvas);}
function saveProcessed(){processedCtx.setTransform(1,0,0,1,0,0);processedCtx.clearRect(0,0,main.width,main.height);processedCtx.drawImage(accCanvas,0,0);showCurrent();}

function setStatus(message){statusEl.textContent=message;}
function clearPreview(){mctx.clearRect(0,0,main.width,main.height);}
function showCurrent(){if(!img)return;const canvas=showingOriginal?source:processedCanvas;mctx.setTransform(1,0,0,1,0,0);clearPreview();mctx.drawImage(canvas,0,0);}
function saveProcessed(){processedCtx.setTransform(1,0,0,1,0,0);processedCtx.clearRect(0,0,main.width,main.height);processedCtx.drawImage(accCanvas,0,0);showCurrent();}
function renderFastPreview(expected){
  if(expected!==revision||!img)return;
  const g=zoneGeometry(getPreviewRenderConfig(true));clearAccumulation(previewSurface,g);
  g.specs.forEach((spec,index)=>{renderFastZone(zctx,g,spec,previewSurface);composeZone(previewSurface,g,spec,index);});
  saveProcessed();
}
async function renderHighQuality(expected){
  if(expected!==revision||!img)return;
  setBusy(true);const g=zoneGeometry(getPreviewRenderConfig(false));clearAccumulation(previewSurface,g);
  for(let index=0;index<g.specs.length;index++){
    if(expected!==revision)return;
    if(!await renderZone(previewSurface,g,g.specs[index],()=>expected===revision,index))return;
  }
  if(expected!==revision)return;
  saveProcessed();hqReady=expected;setBusy(false);if(!exportRunning)setStatus('');
}
function startHQ(expected){
  if(hqReady===expected)return Promise.resolve();
  if(activeHQ)return activeHQ.then(()=>startHQ(expected));
  activeHQ=renderHighQuality(expected).catch(error=>{console.error(error);if(expected===revision)setStatus('图片处理失败，请换一张图片重试');}).then(()=>{activeHQ=null;setBusy(false);});
  return activeHQ;
}
function cancelExport(reason=''){
  if(!exportRunning)return;
  hqExportId++;
  $('#cancelExportBtn').disabled=true;
  if(reason)setStatus(reason);
}
function schedule(){
  const expected=++revision;hqReady=-1;cancelAnimationFrame(raf);clearTimeout(hiTimer);
  if(exportRunning)cancelExport('图片已变化，正在取消生成…');
  if(!img)return;
  raf=requestAnimationFrame(()=>{
    if(expected!==revision)return;
    try{renderFastPreview(expected);}catch(error){console.error(error);setStatus('图片处理失败，请换一张图片重试');return;}
    hiTimer=setTimeout(()=>startHQ(expected),130);
  });
}
function updateControls(){
  $('#angleSlider').value=state.angle;$('#angleValue').textContent=state.angle+'°';
  $('#focusSlider').value=lab.focus;$('#focusValue').textContent=String(lab.focus);updateCenter();
  document.querySelectorAll('[data-preset]').forEach(button=>{
    const selected=button.dataset.preset===activePreset;
    button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));
  });
}
function sizeStage(){
  if(!main.width||!main.height)return;
  const available=stageWrap.clientWidth-parseFloat(getComputedStyle(stageWrap).paddingLeft)*2;
  const maxHeight=Math.min(window.innerHeight*(window.innerWidth<=420?.58:.68),620);
  stage.style.width=Math.max(1,Math.min(available,maxHeight*main.width/main.height))+'px';
}
function loadImage(src,newType,onDone){
  const loadId=++imageRequestId;
  cancelExport('正在载入…');
  revision++;cancelAnimationFrame(raf);clearTimeout(hiTimer);setBusy(false);setStatus('正在载入…');
  const im=new Image();
  const finish=()=>{if(onDone){onDone();onDone=null;}};
  im.onload=()=>{
    finish();if(loadId!==imageRequestId)return;
    try{
      sourceType=newType;img=im;sourceNaturalWidth=im.naturalWidth;sourceNaturalHeight=im.naturalHeight;
      if(!sourceNaturalWidth||!sourceNaturalHeight)throw new Error('空图片');
      const [w,h]=fitSize(sourceNaturalWidth,sourceNaturalHeight,window.innerWidth<=600?MOBILE_PREVIEW_MAX_SIDE:LARGE_PREVIEW_MAX_SIDE);
      for(const canvas of [main,source,zoneCanvas,mixCanvas,previousZoneCanvas,accCanvas,frameCanvas,processedCanvas]){canvas.width=w;canvas.height=h;}
      sizeStage();
      srcCtx.setTransform(1,0,0,1,0,0);srcCtx.fillStyle='#fff';srcCtx.fillRect(0,0,w,h);srcCtx.drawImage(im,0,0,w,h);
      prepareSampleSource(previewSurface,w,h);state.cx=.5;state.cy=.5;updateControls();setStatus('');schedule();
    }catch(error){console.error(error);setBusy(false);setStatus('图片处理失败，请换一张图片重试');}
  };
  im.onerror=()=>{finish();if(loadId===imageRequestId){setBusy(false);setStatus('图片读取失败');}};
  im.src=src;
}
function buildExportSource(g){
  const surface=exportSurface,{w,h}=g;
  for(const canvas of [surface.source,surface.zoneCanvas,surface.mixCanvas,surface.previousZoneCanvas,surface.accCanvas]){canvas.width=w;canvas.height=h;}
  surface.frameCanvas.width=w;surface.frameCanvas.height=h;
  surface.srcCtx.setTransform(1,0,0,1,0,0);surface.srcCtx.fillStyle='#fff';surface.srcCtx.fillRect(0,0,w,h);surface.srcCtx.drawImage(img,0,0,w,h);
  prepareSampleSource(surface,w,h);
}
function releaseExportSurface(){
  for(const canvas of [exportSurface.source,exportSurface.sampleSource,exportSurface.zoneCanvas,exportSurface.mixCanvas,exportSurface.previousZoneCanvas,exportSurface.accCanvas,exportSurface.frameCanvas]){canvas.width=1;canvas.height=1;}
}
async function renderExport(expected,exportId,sourceImage,g){
  const isCurrent=()=>expected===revision&&exportId===hqExportId&&img===sourceImage;
  await yieldToUI();if(!isCurrent())return false;
  buildExportSource(g);if(!isCurrent())return false;
  clearAccumulation(exportSurface,g);
  if(g.blend==='CROSSFADE'&&g.renderMode==='HQ_LINEAR')return renderCrossfadeExportCached(g,isCurrent);
  let completed=0,lastPercent=-1;
  const onSample=()=>{
    completed++;const percent=Math.min(99,Math.floor(100*completed/g.totalN));
    if(percent!==lastPercent){lastPercent=percent;$('#exportBtn').textContent=`正在生成 ${percent}%`;setStatus(`正在生成 ${percent}%`);}
  };
  for(let index=0;index<g.specs.length;index++){
    if(!isCurrent())return false;
    if(!await renderZone(exportSurface,g,g.specs[index],isCurrent,index,g.renderMode,onSample))return false;
    await yieldToUI();
  }
  return isCurrent();
}
async function renderCrossfadeExportCached(g,isCurrent){
  const surface=exportSurface,{zones,specs}=g;
  const boundaries=Array.from({length:zones+1},(_,index)=>{
    const left=specs[Math.max(0,index-1)],right=specs[Math.min(zones-1,index)];
    const inner=left.inner,outer=right.outer;
    const localDeg=computeZoneAngle(index/zones,state.angle*direction);
    return {inner,outer,localDeg,N:adaptiveSamplesForZone(outer,localDeg,g).count};
  });
  const totalSamples=boundaries.reduce((sum,boundary)=>sum+boundary.N,0);
  const totalWork=totalSamples+zones;
  let completedSamples=0,completedBlends=0,lastPercent=-1,boundaryRenders=0;
  const started=performance.now();
  const progress=()=>{
    const percent=Math.min(99,Math.floor(100*(completedSamples+completedBlends)/totalWork));
    if(percent!==lastPercent){lastPercent=percent;$('#exportBtn').textContent=`正在生成 ${percent}%`;setStatus(`正在生成 ${percent}%`);}
  };
  const renderBoundaryExposure=async index=>{
    if(!isCurrent())return false;
    const done=await renderLinearZone(surface,g,boundaries[index],isCurrent,()=>{completedSamples++;progress();});
    if(done)boundaryRenders++;
    return done&&isCurrent();
  };
  if(!await renderBoundaryExposure(0))return false;
  copyCurrentZoneToMix(surface,g);
  for(let index=0;index<zones;index++){
    if(!isCurrent()||!await renderBoundaryExposure(index+1))return false;
    // mixCanvas holds the previous boundary; zoneCanvas holds the new one.
    // Write the blended zone into frameCanvas so the right exposure survives reuse.
    blendRadialZone(surface,g,specs[index],surface.frameCtx);
    composeZone(Object.assign({},surface,{zoneCanvas:surface.frameCanvas,zctx:surface.frameCtx}),g,specs[index],index);
    completedBlends++;progress();
    if(!isCurrent())return false;
    if(index<zones-1)copyCurrentZoneToMix(surface,g);
    await yieldToUI();
  }
  if(DEBUG)console.debug({sourceType,renderMode:g.renderMode,sourceSize:[sourceNaturalWidth,sourceNaturalHeight],exportSize:[g.w,g.h],boundaryRenders,cacheHits:zones-1,totalSamples,renderMs:Math.round(performance.now()-started)});
  return isCurrent();
}
function exportFileName(){
  const d=new Date(),pad=n=>String(n).padStart(2,'0');
  return `spin-exposure-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
}
async function exportImage(){
  if(exportRunning||!img)return;
  const miniTool=window.xhs&&window.xhs.miniTool;
  if(miniTool&&typeof miniTool.saveImageToPhotosAlbum!=='function'){setStatus('当前小工具不支持保存到相册');return;}
  exportRunning=true;clearTimeout(hiTimer);cancelAnimationFrame(raf);
  const button=$('#exportBtn'),cancel=$('#cancelExportBtn'),expected=++revision,exportId=++hqExportId,sourceImage=img;
  button.disabled=true;button.textContent='正在生成 0%';cancel.hidden=false;cancel.disabled=false;setStatus('正在生成 0%');
  try{
    const g=zoneGeometry(getExportRenderConfig());
    if(!await renderExport(expected,exportId,sourceImage,g))return;
    button.textContent='正在生成 100%';setStatus('正在生成 100%');
    const blob=await new Promise((resolve,reject)=>{try{exportSurface.accCanvas.toBlob(resolve,'image/png');}catch(error){reject(error);}});
    if(!blob)throw new Error('PNG 编码失败');
    if(expected!==revision||exportId!==hqExportId||img!==sourceImage)return;
    if(miniTool){
    const dataUrl=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=()=>reject(reader.error||new Error('图片编码失败'));
      reader.readAsDataURL(blob);
    });
    if(expected!==revision||exportId!==hqExportId||img!==sourceImage)return;
    setStatus('正在保存到相册');button.textContent='正在保存到相册';
    let filePath=dataUrl;
    if(typeof miniTool.writeTempFile==='function'){
      const temp=await miniTool.writeTempFile({data:dataUrl});
      if(!temp||!temp.filePath)throw new Error('临时图片保存失败');
      filePath=temp.filePath;
    }
    if(expected!==revision||exportId!==hqExportId||img!==sourceImage)return;
    await miniTool.saveImageToPhotosAlbum({filePath});
    if(expected!==revision||exportId!==hqExportId||img!==sourceImage)return;
    setStatus('已保存到相册');button.textContent='已保存到相册';
    }else{
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=exportFileName();
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      setStatus('已开始下载 PNG');button.textContent='已开始下载';
    }
  }catch(error){
    console.error(error);
    const reason=String(error&&((error.errMsg)||error.message)||'');
    setStatus(/auth|permission|denied|权限|拒绝/i.test(reason)?'相册权限未开启，请允许小红书保存照片后重试':'生成或保存失败，请重试');
  }
  finally{
    releaseExportSurface();exportRunning=false;cancel.hidden=true;cancel.disabled=false;button.disabled=false;
    setTimeout(()=>{if(!exportRunning)button.textContent=window.xhs&&window.xhs.miniTool?'保存到相册':'保存到本地';},1200);
    if(exportId!==hqExportId&&statusEl.textContent.includes('取消'))setStatus('已取消');
    if(img&&hqReady!==revision&&!activeHQ)hiTimer=setTimeout(()=>startHQ(revision),130);
  }
}
function updateCenterFromPointer(event){
  const rect=main.getBoundingClientRect();
  state.cx=clamp((event.clientX-rect.left)/rect.width,0,1);
  state.cy=clamp((event.clientY-rect.top)/rect.height,0,1);
  updateCenter();schedule();
}
let dragging=false;
stage.addEventListener('pointerdown',event=>{if(!img)return;dragging=true;stage.setPointerCapture(event.pointerId);updateCenterFromPointer(event);event.preventDefault();});
stage.addEventListener('pointermove',event=>{if(dragging)updateCenterFromPointer(event);});
function endCenterDrag(event){if(!dragging)return;dragging=false;if(stage.hasPointerCapture(event.pointerId))stage.releasePointerCapture(event.pointerId);schedule();}
stage.addEventListener('pointerup',endCenterDrag);stage.addEventListener('pointercancel',endCenterDrag);
document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{
  const preset=presets[button.dataset.preset];
  state.angle=preset.angle;lab.focus=preset.focus;activePreset=button.dataset.preset;
  updateControls();schedule();
}));
$('#angleSlider').addEventListener('input',event=>{state.angle=Number(event.target.value);activePreset=null;updateControls();schedule();});
$('#focusSlider').addEventListener('input',event=>{lab.focus=Number(event.target.value);activePreset=null;updateControls();schedule();});
$('#importBtn').onclick=()=>$('#fileInput').click();
$('#fileInput').onchange=event=>{
  const file=event.target.files&&event.target.files[0];event.target.value='';if(!file)return;
  if(!file.type.startsWith('image/')){setStatus('请选择有效图片');return;}
  sourceType='custom';const url=URL.createObjectURL(file);
  loadImage(url,'custom',()=>URL.revokeObjectURL(url));
};
$('#exportBtn').textContent=window.xhs&&window.xhs.miniTool?'保存到相册':'保存到本地';
$('#exportBtn').onclick=exportImage;
$('#cancelExportBtn').onclick=()=>cancelExport('正在取消生成…');
const hold=$('#holdOriginal');
const endHold=()=>{if(showingOriginal){showingOriginal=false;showCurrent();}};
hold.addEventListener('pointerdown',event=>{if(!img)return;showingOriginal=true;hold.setPointerCapture(event.pointerId);showCurrent();event.preventDefault();});
hold.addEventListener('pointerup',endHold);hold.addEventListener('pointercancel',endHold);hold.addEventListener('lostpointercapture',endHold);
$('#resetBtn').onclick=()=>{state.angle=12;lab.focus=50;lab.k=FOCUS_K;state.cx=.5;state.cy=.5;activePreset='standard';updateControls();schedule();};
window.addEventListener('resize',sizeStage);
updateControls();loadImage(whiteFlowerSrc,'demo');
