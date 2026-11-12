/* PixPeel 拆元素引擎（与“小剪动画”里的拆元素同一套算法）。纯前端，无依赖。 */
const uid=()=>Math.random().toString(36).slice(2,10);
const _yield=()=>new Promise(r=>{const c=new MessageChannel();c.port1.onmessage=()=>r();c.port2.postMessage(0)});
const SEG={src:null,layers:[],sel:new Set(),hov:null,tool:'pick',mode:'new',tol:40,merge:6,minA:.15,how:'auto',K:6,fromClip:null,lasso:null,ai:null,busy:false,seq:1};
const SEGCOL=['#ff5d8f','#4dd0e1','#ffd54f','#9ccc65','#b388ff','#ff8a65','#4db6ac','#f06292','#7986cb','#aed581','#ffb74d','#4fc3f7'];
function segPrep(el,w,h){
  const s=Math.min(1,1600/Math.max(w,h)),W=Math.max(1,Math.round(w*s)),H=Math.max(1,Math.round(h*s));
  const cv=document.createElement('canvas');cv.width=W;cv.height=H;const g=cv.getContext('2d',{willReadFrequently:true});g.drawImage(el,0,0,W,H);
  const id=g.getImageData(0,0,W,H);return{w:W,h:H,data:id.data,cv};
}
/* 膨胀（盒形，行列各一遍） */
function segDil(m,w,h,r){
  if(r<=0)return m;
  const t=new Uint8Array(w*h),o=new Uint8Array(w*h),ps=new Int32Array(Math.max(w,h)+1);
  for(let y=0;y<h;y++){const row=y*w;ps[0]=0;for(let x=0;x<w;x++)ps[x+1]=ps[x]+m[row+x];
    for(let x=0;x<w;x++)t[row+x]=ps[Math.min(w,x+r+1)]-ps[Math.max(0,x-r)]>0?1:0}
  for(let x=0;x<w;x++){ps[0]=0;for(let y=0;y<h;y++)ps[y+1]=ps[y]+t[y*w+x];
    for(let y=0;y<h;y++)o[y*w+x]=ps[Math.min(h,y+r+1)]-ps[Math.max(0,y-r)]>0?1:0}
  return o;
}
function segErode(m,w,h,r){const inv=new Uint8Array(w*h);for(let i=0;i<inv.length;i++)inv[i]=m[i]?0:1;const d=segDil(inv,w,h,r);const o=new Uint8Array(w*h);for(let i=0;i<o.length;i++)o[i]=d[i]?0:1;return o}
/* 8 连通域 */
function segCC(m,w,h){
  const n=w*h,lab=new Int32Array(n),st=new Int32Array(n),comps=[null];let cnt=0;
  for(let i=0;i<n;i++){
    if(!m[i]||lab[i])continue;
    cnt++;let sp=0,area=0,x0=w,y0=h,x1=0,y1=0;st[sp++]=i;lab[i]=cnt;
    while(sp){
      const p=st[--sp],x=p%w,y=(p/w)|0;area++;
      if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
      for(let dy=-1;dy<=1;dy++){const ny=y+dy;if(ny<0||ny>=h)continue;
        for(let dx=-1;dx<=1;dx++){const nx=x+dx;if(nx<0||nx>=w)continue;const q=ny*w+nx;if(m[q]&&!lab[q]){lab[q]=cnt;st[sp++]=q}}}
    }
    comps.push({area,x0,y0,x1,y1});
  }
  return{lab,n:cnt,comps};
}
function segLayerFromFull(full,w,h,name){
  let x0=w,y0=h,x1=-1,y1=-1,area=0;
  for(let y=0;y<h;y++){const row=y*w;for(let x=0;x<w;x++)if(full[row+x]){area++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}}
  if(!area)return null;
  const bw=x1-x0+1,bh=y1-y0+1,m=new Uint8Array(bw*bh);
  for(let y=0;y<bh;y++)for(let x=0;x<bw;x++)m[y*bw+x]=full[(y0+y)*w+x0+x];
  return segMk({bx:x0,by:y0,bw,bh,m,area,name});
}
function segMk(o){
  const L=Object.assign({id:uid(),on:true},o);L.name=L.name||(t('elem')+' '+(SEG.seq++));
  L.color=SEGCOL[(SEG.layers.length+SEG.seq)%SEGCOL.length];
  const c=document.createElement('canvas');c.width=L.bw;c.height=L.bh;const g=c.getContext('2d'),id=g.createImageData(L.bw,L.bh);
  const rgb=[parseInt(L.color.slice(1,3),16),parseInt(L.color.slice(3,5),16),parseInt(L.color.slice(5,7),16)];
  for(let i=0;i<L.m.length;i++)if(L.m[i]){const j=i*4;id.data[j]=rgb[0];id.data[j+1]=rgb[1];id.data[j+2]=rgb[2];id.data[j+3]=255}
  g.putImageData(id,0,0);L.tint=c;return L;
}
function segFull(L){const {w,h}=SEG.src,f=new Uint8Array(w*h);for(let y=0;y<L.bh;y++)for(let x=0;x<L.bw;x++)if(L.m[y*L.bw+x])f[(L.by+y)*w+L.bx+x]=1;return f}
/* 取出前景（透明度 / 背景色） */
function segFg(img,tol){
  const {w,h,data}=img,n=w*h,fg=new Uint8Array(n);let tr=0;
  for(let i=0;i<n;i++)if(data[i*4+3]<24)tr++;
  if(tr>n*.02){for(let i=0;i<n;i++)fg[i]=data[i*4+3]>=24?1:0;return{fg,mode:'alpha'}}
  const hist=new Map(),bd=[];
  const take=p=>{const j=p*4,key=(data[j]>>4)<<8|(data[j+1]>>4)<<4|(data[j+2]>>4);hist.set(key,(hist.get(key)||0)+1);bd.push(p)};
  for(let x=0;x<w;x++){take(x);take((h-1)*w+x)}for(let y=1;y<h-1;y++){take(y*w);take(y*w+w-1)}
  let best=-1,bc=0;for(const [k,c] of hist)if(c>bc){bc=c;best=k}
  let r=0,g=0,b=0,c=0;for(const p of bd){const j=p*4,key=(data[j]>>4)<<8|(data[j+1]>>4)<<4|(data[j+2]>>4);if(key===best){r+=data[j];g+=data[j+1];b+=data[j+2];c++}}
  r/=c;g/=c;b/=c;
  const t2=tol*tol,near=p=>{const j=p*4;if(data[j+3]<24)return true;const dr=data[j]-r,dg=data[j+1]-g,db=data[j+2]-b;return dr*dr+dg*dg+db*db<=t2};
  let okb=0;for(const p of bd)if(near(p))okb++;
  if(okb<bd.length*.6)return{fg:null,mode:'color'};
  const bgm=new Uint8Array(n),st=new Int32Array(n);let sp=0;
  for(const p of bd)if(near(p)&&!bgm[p]){bgm[p]=1;st[sp++]=p}
  while(sp){const p=st[--sp],x=p%w,y=(p/w)|0;
    if(x>0&&!bgm[p-1]&&near(p-1)){bgm[p-1]=1;st[sp++]=p-1}
    if(x<w-1&&!bgm[p+1]&&near(p+1)){bgm[p+1]=1;st[sp++]=p+1}
    if(y>0&&!bgm[p-w]&&near(p-w)){bgm[p-w]=1;st[sp++]=p-w}
    if(y<h-1&&!bgm[p+w]&&near(p+w)){bgm[p+w]=1;st[sp++]=p+w}}
  for(let i=0;i<n;i++)fg[i]=bgm[i]?0:1;
  return{fg,mode:'bg',bg:[r,g,b]};
}
function segKmeans(img,K){
  const {w,h,data}=img,n=w*h,step=Math.max(1,Math.floor(n/6000)),S_=[];
  for(let i=0;i<n;i+=step)S_.push([data[i*4],data[i*4+1],data[i*4+2]]);
  const C=[S_[0].slice()];
  while(C.length<K){let bi=0,bd=-1;S_.forEach((s,i)=>{let d=1e9;for(const c of C){const e=(s[0]-c[0])**2+(s[1]-c[1])**2+(s[2]-c[2])**2;if(e<d)d=e}if(d>bd){bd=d;bi=i}});C.push(S_[bi].slice())}
  for(let it=0;it<8;it++){
    const sum=C.map(()=>[0,0,0,0]);
    for(const s of S_){let bi=0,bd=1e9;C.forEach((c,i)=>{const e=(s[0]-c[0])**2+(s[1]-c[1])**2+(s[2]-c[2])**2;if(e<bd){bd=e;bi=i}});const q=sum[bi];q[0]+=s[0];q[1]+=s[1];q[2]+=s[2];q[3]++}
    sum.forEach((q,i)=>{if(q[3])C[i]=[q[0]/q[3],q[1]/q[3],q[2]/q[3]]});
  }
  const lab=new Uint8Array(n);
  for(let i=0;i<n;i++){const r=data[i*4],g=data[i*4+1],b=data[i*4+2];let bi=0,bd=1e9;for(let k=0;k<C.length;k++){const c=C[k],e=(r-c[0])**2+(g-c[1])**2+(b-c[2])**2;if(e<bd){bd=e;bi=k}}lab[i]=bi}
  return{lab,K:C.length};
}
async function segAuto(){
  const img=SEG.src,{w,h}=img,n=w*h,minA=Math.max(8,SEG.minA/100*n),out=[];
  let how=SEG.how,info='';
  let f=null;
  if(how!=='color'){f=segFg(img,SEG.tol);if(f.mode==='color'){if(how==='auto'){how='color';info=t('eInfoColor')}else f=null}else info=f.mode==='alpha'?t('eAlpha'):t('eBgDone')}
  if(how==='color'||!f||!f.fg){
    const km=segKmeans(img,SEG.K);
    for(let k=0;k<km.K;k++){
      const m=new Uint8Array(n);let any=0;for(let i=0;i<n;i++)if(km.lab[i]===k){m[i]=1;any++}
      if(any<minA)continue;
      const cc=segCC(m,w,h);
      for(let q=1;q<=cc.n;q++){const cp=cc.comps[q];if(cp.area<minA)continue;
        const bw=cp.x1-cp.x0+1,bh=cp.y1-cp.y0+1,mm=new Uint8Array(bw*bh);
        for(let y=0;y<bh;y++)for(let x=0;x<bw;x++)if(cc.lab[(cp.y0+y)*w+cp.x0+x]===q)mm[y*bw+x]=1;
        out.push({bx:cp.x0,by:cp.y0,bw,bh,m:mm,area:cp.area});
      }
      await _yield();
    }
  }else{
    const dm=segDil(f.fg,w,h,SEG.merge),cc=segCC(dm,w,h);
    for(let q=1;q<=cc.n;q++){
      const cp=cc.comps[q],bw=cp.x1-cp.x0+1,bh=cp.y1-cp.y0+1,mm=new Uint8Array(bw*bh);let area=0;
      for(let y=0;y<bh;y++){const ro=(cp.y0+y)*w+cp.x0;for(let x=0;x<bw;x++){if(cc.lab[ro+x]===q&&f.fg[ro+x]){mm[y*bw+x]=1;area++}}}
      if(area<minA)continue;
      out.push({bx:cp.x0,by:cp.y0,bw,bh,m:mm,area});
    }
  }
  out.sort((a,b)=>b.area-a.area);
  SEG.layers=[];SEG.seq=1;SEG.sel.clear();
  for(const o of out.slice(0,60))SEG.layers.push(segMk(o));
  return info+(out.length>60?t('eTooMany'):'');
}
/* 魔棒 */
function segWand(x,y,tol){
  const {w,h,data}=SEG.src,n=w*h,m=new Uint8Array(n),st=new Int32Array(n);let sp=0;
  const p0=y*w+x,j0=p0*4,r=data[j0],g=data[j0+1],b=data[j0+2],a0=data[j0+3],t2=tol*tol;
  const ok=p=>{const j=p*4;if(Math.abs(data[j+3]-a0)>60)return false;if(a0<24)return true;const dr=data[j]-r,dg=data[j+1]-g,db=data[j+2]-b;return dr*dr+dg*dg+db*db<=t2};
  m[p0]=1;st[sp++]=p0;
  while(sp){const p=st[--sp],px=p%w,py=(p/w)|0;
    if(px>0&&!m[p-1]&&ok(p-1)){m[p-1]=1;st[sp++]=p-1}
    if(px<w-1&&!m[p+1]&&ok(p+1)){m[p+1]=1;st[sp++]=p+1}
    if(py>0&&!m[p-w]&&ok(p-w)){m[p-w]=1;st[sp++]=p-w}
    if(py<h-1&&!m[p+w]&&ok(p+w)){m[p+w]=1;st[sp++]=p+w}}
  return m;
}
/* 把一个整图蒙版并进图层：新建 / 加到所选 / 从所选减去 */
/* 加 / 减的对象：点选中的元素 → 否则勾选了的元素 →（只有“减去”）圈到的元素 */
function segTargets(full){
  const {w}=SEG.src,act=SEG.layers.find(l=>l.id===[...SEG.sel][0]);
  if(act)return[act];
  const on=SEG.layers.filter(l=>l.on);
  if(SEG.mode==='add')return on.length===1?on:[];
  if(on.length)return on;
  return SEG.layers.filter(L=>{for(let y=0;y<L.bh;y++)for(let x=0;x<L.bw;x++)if(L.m[y*L.bw+x]&&full[(L.by+y)*w+L.bx+x])return true;return false});
}
function segApply(full){
  const {w,h}=SEG.src;
  if(SEG.mode==='new'){const nl=segLayerFromFull(full,w,h);if(!nl){toast(t('eNoSel'));return}SEG.layers.push(nl);SEG.sel=new Set([nl.id]);return}
  const ts=segTargets(full);
  if(!ts.length){toast(t(SEG.mode==='add'?'eNeedSel':'eNoHit'));return}
  let last=null;
  for(const L of ts){
    const cur=segFull(L);
    for(let i=0;i<cur.length;i++){if(SEG.mode==='add'){if(full[i])cur[i]=1}else if(full[i])cur[i]=0}
    const nl=segLayerFromFull(cur,w,h,L.name),ix=SEG.layers.indexOf(L);
    if(!nl){SEG.layers.splice(ix,1);SEG.sel.delete(L.id);continue}
    nl.color=L.color;nl.on=L.on;SEG.layers[ix]=nl;last=nl;
  }
  SEG.sel=last?new Set([last.id]):new Set();
}
/* 取出一个图层的透明底图 */
function segCut(L,pad){
  const {w,data}=SEG.src,p=pad||1,W=L.bw+p*2,H=L.bh+p*2;
  const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d'),id=g.createImageData(W,H);
  const mv=(x,y)=>(x<0||y<0||x>=L.bw||y>=L.bh)?0:L.m[y*L.bw+x];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const mx=x-p,my=y-p;let s=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)s+=mv(mx+dx,my+dy);
    const a=mv(mx,my)?(s>=9?1:(.55+.45*s/9)):(s>0?s/9*.7:0);
    if(a<=0)continue;
    const sx=L.bx+mx,sy=L.by+my,si=(Math.max(0,sy)*w+Math.max(0,Math.min(w-1,sx)))*4,d=(y*W+x)*4;
    id.data[d]=data[si];id.data[d+1]=data[si+1];id.data[d+2]=data[si+2];id.data[d+3]=Math.round(255*a*data[si+3]/255);
  }
  g.putImageData(id,0,0);return{cv:c,px:L.bx-p,py:L.by-p};
}
/* ── AI 点选（SlimSAM，放在 Worker 里，需联网下载模型） ── */
/* 模型有两种：量化版（q8，默认）和浮点版。
 * 量化：模型小（十几 MB）、下载快、省内存，日常够用；
 * 浮点：精度略高，但体积和内存都要多一倍多，机器够好再换。 */
let AI_MODE = 'q8';
function aiSetMode(m) {
  const n = (m === 'fp32') ? 'fp32' : 'q8';
  if (n === AI_MODE) return;
  AI_MODE = n;
  if (SEG.ai) { try { SEG.ai.w.terminate(); URL.revokeObjectURL(SEG.ai.url); } catch (e) { } SEG.ai = null; }
}
const aiCacheKey = () => 'pp_ai_' + AI_MODE;
const aiCached = () => { try { return localStorage.getItem(aiCacheKey()) === '1'; } catch (e) { return false; } };
const aiMarkReady = () => { try { localStorage.setItem(aiCacheKey(), '1'); } catch (e) { } };

function segAIWorker(){
  if(SEG.ai)return SEG.ai;
  const M=JSON.stringify({lib:t('aiLib'),libFail:t('aiLibFail'),pick:t('aiPick'),from:t('aiFrom'),modelFail:t('aiModelFail')});
  const DT=JSON.stringify(AI_MODE === 'fp32' ? null : 'q8');
  const code=`const M=${M};const DT=${DT};let model,proc,emb,raw,RI;
  const ID='Xenova/slimsam-77-uniform';
  const fast=urls=>{const ctl=urls.map(()=>new AbortController());const to=setTimeout(()=>ctl.forEach(c=>c.abort()),6000);return Promise.any(urls.map((u,i)=>fetch(u,{signal:ctl[i].signal,cache:'no-store'}).then(r=>{if(!r.ok)throw 0;ctl.forEach((c,j)=>j!==i&&c.abort());return u}))).then(u=>{clearTimeout(to);return u}).catch(()=>{clearTimeout(to);return null})};
  self.onmessage=async e=>{const m=e.data;try{
   if(m.t==='init'){
     let T=null;postMessage({t:'st',msg:M.lib});
     for(const u of ['https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/+esm','https://fastly.jsdelivr.net/npm/@huggingface/transformers@3.0.2/+esm','https://unpkg.com/@huggingface/transformers@3.0.2/+esm']){try{T=await import(u);break}catch(x){}}
     if(!T)throw new Error(M.libFail);
     T.env.allowLocalModels=false;RI=T.RawImage;
     postMessage({t:'st',msg:M.pick});
     const hosts=['https://huggingface.co','https://hf-mirror.com'];
     const ok=await fast(hosts.map(h=>h+'/'+ID+'/resolve/main/config.json'));
     const order=ok?[hosts.find(h=>ok.startsWith(h)),...hosts.filter(h=>!ok.startsWith(h))]:hosts.slice().reverse();
     const files={},pg=p=>{if(p.file&&p.total){files[p.file]={l:p.loaded||0,t:p.total};let l=0,t=0;for(const k in files){l+=files[k].l;t+=files[k].t}postMessage({t:'prog',l,tt:t})}};
     let lastErr=null;
     for(const h of order){
       T.env.remoteHost=h+'/';
       for(const dt of (DT?[DT,null]:[null])){
         try{postMessage({t:'st',msg:M.from.replace('{h}',h.replace('https://',''))});
           const o={progress_callback:pg};if(dt)o.dtype=dt;
           model=await T.SamModel.from_pretrained(ID,o);proc=await T.AutoProcessor.from_pretrained(ID);lastErr=null;break}catch(x){lastErr=x;model=null}
       }
       if(model)break;
     }
     if(!model)throw lastErr||new Error(M.modelFail);
     postMessage({t:'ready'})}
   else if(m.t==='embed'){raw=await RI.fromBlob(m.blob);const inp=await proc(raw);emb=await model.get_image_embeddings(inp);postMessage({t:'embedded'})}
   else if(m.t==='click'){const inputs=await proc(raw,{input_points:[[m.pts]]});const out=await model({...emb,...inputs});
     const masks=await proc.post_process_masks(out.pred_masks,inputs.original_sizes,inputs.reshaped_input_sizes);
     const t=masks[0],d=t.dims,H=d[d.length-2],W=d[d.length-1],sc=out.iou_scores.data;let bi=0;for(let i=1;i<sc.length;i++)if(sc[i]>sc[bi])bi=i;
     const o=new Uint8Array(W*H),off=bi*W*H;for(let i=0;i<W*H;i++)o[i]=t.data[off+i]?1:0;postMessage({t:'mask',m:o,W,H},[o.buffer])}
  }catch(err){postMessage({t:'err',msg:String(err&&err.message||err)})}}`;
  const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
  const w=new Worker(url);SEG.ai={w,ready:false,embedded:false,url};return SEG.ai;
}
function segAIcall(msg,want,transfer){
  const A=segAIWorker();
  return new Promise((res,rej)=>{
    const h=e=>{const d=e.data;
      if(d.t==='st'){segBusy(d.msg);return}
      if(d.t==='prog'){const mb=x=>(x/1048576).toFixed(1);segBusy(t('aiDl',{l:mb(d.l),t:mb(d.tt)}));return}
      if(d.t==='err'){A.w.removeEventListener('message',h);rej(new Error(d.msg));return}
      if(d.t===want){A.w.removeEventListener('message',h);res(d)}};
    A.w.addEventListener('message',h);A.w.postMessage(msg,transfer||[]);
  });
}
async function segAIClick(x,y){
  const A=segAIWorker();
  try{
    if(!A.ready){segBusy(aiCached()?t('aiSee'):t('aiLoad'));await segAIcall({t:'init'},'ready');A.ready=true;aiMarkReady()}
    if(!A.embedded){segBusy(t('aiSee'));const bl=await new Promise(r=>SEG.src.cv.toBlob(r,'image/png'));await segAIcall({t:'embed',blob:bl},'embedded');A.embedded=true}
    segBusy(t('aiFind'));
    const d=await segAIcall({t:'click',pts:[[x,y]]},'mask');
    segBusy('');
    const {w,h}=SEG.src;if(d.W!==w||d.H!==h){toast(t('aiSize'));return}
    segApply(d.m);segRender();
  }catch(e){segBusy('');console.warn(e);toast(t('aiFail',{e:String(e.message||e).slice(0,60)}))}
}
function segBusy(t){const b=$('#segBusy');if(!b)return;b.textContent=t||'';b.style.display=t?'grid':'none'}
