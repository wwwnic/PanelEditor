'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const fresh = () => ({version:1,id:crypto.randomUUID(),name:'Untitled page',panels:Array.from({length:6},()=>({image:null,fit:'cover',bubbles:[]}))});
let project = fresh(), panelIndex = 0, bubbleId = null, chosenStyle = 'speech', dirty = false, revision = 0;
let toastTimer;
try { const draft=JSON.parse(localStorage.getItem('panel-ink-draft')); if(draft?.panels?.length===6){project=draft;dirty=true;} } catch {}
const panel = () => project.panels[panelIndex];
const bubble = () => panel().bubbles.find(b=>b.id===bubbleId);
function toast(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',4200);}
async function api(url,options){const response=await fetch(url,options);const value=await response.json();if(!response.ok)throw Error(value.error||'Request failed');return value;}
function changed(){dirty=true;revision++;$('saveState').textContent='Unsaved changes · draft kept in this browser';try{localStorage.setItem('panel-ink-draft',JSON.stringify(project));}catch{$('saveState').textContent='Unsaved changes · click Save page';}}
const measure=document.createElement('canvas').getContext('2d');
function linesFor(text,maxWidth,size){
  measure.font=`bold ${size}px "Comic Sans MS", Arial, sans-serif`;
  const lines=[];
  for(const paragraph of text.split('\n')){
    let line='';
    for(const word of paragraph.split(/\s+/)){
      if(measure.measureText((line?line+' ':'')+word).width<=maxWidth){line+=(line?' ':'')+word;continue;}
      if(line){lines.push(line);line='';}
      for(const char of word){if(line&&measure.measureText(line+char).width>maxWidth){lines.push(line);line='';}line+=char;}
    }
    lines.push(line);
  }
  return lines;
}
function tailLength(b){return Math.max(0,Math.min(300,Number(b.tailLength??30)||0));}
function hasTail(b){return b.tail!=='none'&&b.style!=='caption';}
function bubbleRenderHeight(b){return hasTail(b)?b.h-30+tailLength(b):b.h;}
function bubbleSVG(b){
  const w=b.w,h=bubbleRenderHeight(b),body=b.h-30,cx=w/2,cy=body/2,rx=w/2-4,ry=body/2-4;
  let shape='';
  const fill='fill="white" stroke="#161616" stroke-width="4" stroke-linejoin="round"';
  if(b.style==='caption')shape=`<rect x="3" y="3" width="${w-6}" height="${body-6}" ${fill}/>`;
  else if(b.style==='shout'){
    const points=Array.from({length:40},(_,i)=>{const a=i*Math.PI/20,r=i%2?0.80:1;return `${cx+Math.cos(a)*rx*r},${cy+Math.sin(a)*ry*r}`;}).join(' ');
    shape=`<polygon points="${points}" ${fill}/>`;
  }else if(b.style==='thought'){
    let d='';
    for(let i=0;i<12;i++){let a=(i/12)*Math.PI*2,an=((i+1)/12)*Math.PI*2;const x=cx+rx*Math.cos(a),y=cy+ry*Math.sin(a),nx=cx+rx*Math.cos(an),ny=cy+ry*Math.sin(an),mid=(a+an)/2;d+=(i===0?`M ${x} ${y}`:'')+` Q ${cx+rx*1.18*Math.cos(mid)} ${cy+ry*1.18*Math.sin(mid)} ${nx} ${ny}`;}
    shape=`<path d="${d} Z" ${fill}/>`;
  }else shape=`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${fill}/>`;
  if(hasTail(b)&&tailLength(b)>0){
    const x=b.tail==='right'?w*.73:w*.27,tip=b.tail==='right'?w*.92:w*.08;
    if(b.style==='thought')shape+=`<circle cx="${x}" cy="${body+tailLength(b)*.2}" r="${Math.min(9,tailLength(b)/3)}" ${fill}/><circle cx="${tip}" cy="${h-5}" r="${Math.min(4,tailLength(b)/5)}" ${fill}/>`;
    else shape+=`<path d="M ${x-14} ${body-17} L ${tip} ${h-3} L ${x+16} ${body-12}" fill="white" stroke="#161616" stroke-width="4" stroke-linejoin="round"/>`;
  }
  let size=b.fontSize||30,lines=linesFor(b.text,w*.66,size);
  while(size>10&&lines.length*size*1.2>body*.65){size--;lines=linesFor(b.text,w*.66,size);}
  const start=cy-(lines.length-1)*size*.6;
  const text=lines.map((line,i)=>`<text x="${cx}" y="${start+i*size*1.2}" text-anchor="middle" dominant-baseline="middle" font-family="Comic Sans MS, Arial, sans-serif" font-weight="bold" font-size="${size}" fill="#111">${esc(line)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${shape}${text}</svg>`;
}
function render(){
  $('pageName').value=project.name;
  $('paper').replaceChildren();
  project.panels.forEach((p,index)=>{
    const cell=document.createElement('div');cell.className='comic-panel'+(index===panelIndex?' selected':'');cell.dataset.panel=index;cell.tabIndex=0;cell.setAttribute('aria-label',`Panel ${index+1}`);
    if(p.image){const img=document.createElement('img');img.className='panel-art';img.src=p.image;img.alt=`Artwork for panel ${index+1}`;img.style.objectFit=p.fit||'cover';img.draggable=false;cell.append(img);}
    else{const placeholder=document.createElement('div');placeholder.className='panel-placeholder';placeholder.innerHTML=`<strong>${String(index+1).padStart(2,'0')}</strong><span>Select artwork from your library</span>`;cell.append(placeholder);}
    p.bubbles.forEach(b=>{
      const el=document.createElement('div');el.className='bubble'+(index===panelIndex&&b.id===bubbleId?' active':'');el.dataset.bubble=b.id;el.style.cssText=`left:${b.x/7.2}%;top:${b.y/7.2}%;width:${b.w/7.2}%;height:${bubbleRenderHeight(b)/7.2}%`;el.innerHTML=bubbleSVG(b);el.setAttribute('aria-label',b.text||'Speech bubble');
      el.addEventListener('pointerdown',event=>startDrag(event,index,b,el));
      el.addEventListener('dblclick',()=>{$('dialogue').focus();$('dialogue').select();});cell.append(el);
    });
    cell.addEventListener('click',event=>{if(event.target.closest('.bubble'))return;panelIndex=index;bubbleId=null;render();});
    cell.addEventListener('keydown',event=>{if(event.key==='Enter'){panelIndex=index;bubbleId=null;render();}});
    cell.addEventListener('dragover',event=>event.preventDefault());
    cell.addEventListener('drop',async event=>{event.preventDefault();panelIndex=index;const url=event.dataTransfer.getData('text/plain');if(url.startsWith('/images/')){panel().image=url;changed();render();}else if(event.dataTransfer.files.length){await uploadFiles(event.dataTransfer.files,true);}});
    $('paper').append(cell);
  });
  syncControls();
}
function syncControls(){
  const b=bubble(), number=String(panelIndex+1).padStart(2,'0');
  $('selectionLabel').textContent=`Panel ${number}${b?' · Bubble selected':''}`;$('panelStatus').textContent=`Panel ${number} selected`;
  $('bubbleControls').hidden=!b;$('noBubble').hidden=!!b;$('imageFit').value=panel().fit||'cover';
  document.querySelectorAll('[data-style]').forEach(el=>el.classList.toggle('chosen',el.dataset.style===chosenStyle));
  if(b){$('dialogue').value=b.text;$('fontSize').value=b.fontSize;$('bubbleWidth').value=b.w;$('bubbleHeight').value=b.h;$('tail').value=b.tail;$('bubbleStyle').value=b.style;$('tailLength').value=tailLength(b);$('tailLengthValue').textContent=tailLength(b)+' px';$('tailLength').disabled=!hasTail(b);}
}
function startDrag(event,index,b,el){
  if(event.button!==0)return;event.preventDefault();event.stopPropagation();panelIndex=index;bubbleId=b.id;
  document.querySelectorAll('.comic-panel').forEach((e,i)=>e.classList.toggle('selected',i===index));document.querySelectorAll('.bubble').forEach(e=>e.classList.toggle('active',e===el));syncControls();
  const rect=el.parentElement.getBoundingClientRect(),sx=event.clientX,sy=event.clientY,ox=b.x,oy=b.y;let moved=false;
  el.setPointerCapture(event.pointerId);
  el.onpointermove=e=>{moved=true;b.x=Math.round(Math.max(0,Math.min(720-b.w,ox+(e.clientX-sx)*720/rect.width)));b.y=Math.round(Math.max(0,Math.min(720-bubbleRenderHeight(b),oy+(e.clientY-sy)*720/rect.height)));el.style.left=b.x/7.2+'%';el.style.top=b.y/7.2+'%';};
  el.onpointerup=el.onpointercancel=()=>{el.onpointermove=null;el.onpointerup=null;el.onpointercancel=null;if(moved)changed();};
}
async function refreshImages(){
  try{const images=await api('/api/images');$('imageList').replaceChildren();
    for(const item of images){const button=document.createElement('button');button.className='asset';button.title=item.name;const img=document.createElement('img');img.src=item.url;img.alt=item.name;img.loading='lazy';const label=document.createElement('span');label.textContent=item.name;button.append(img,label);button.onclick=()=>{panel().image=item.url;changed();render();};button.draggable=true;button.ondragstart=e=>e.dataTransfer.setData('text/plain',item.url);$('imageList').append(button);}
    if(!images.length)$('imageList').innerHTML='<div class="empty-library">Your next scene goes here.<br>Add images to get started.</div>';
  }catch(error){toast(error.message);}
}
async function uploadFiles(files,place=false){
  const targetProject=project,targetPanel=panel();
  try{let first;for(const file of files){const result=await api('/api/images?name='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});first??=result.url;}await refreshImages();if(first&&project===targetProject&&(place||!targetPanel.image)){targetPanel.image=first;changed();render();}toast('Images added to your library');}catch(error){toast(error.message);}
}
$('upload').onchange=async event=>{await uploadFiles(event.target.files);event.target.value='';};
$('upload').previousElementSibling.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('upload').click();}});
$('refresh').onclick=refreshImages;
document.querySelectorAll('[data-style]').forEach(button=>button.onclick=()=>{chosenStyle=button.dataset.style;syncControls();});
$('addBubble').onclick=()=>{const b={id:crypto.randomUUID(),style:chosenStyle,text:chosenStyle==='caption'?'Meanwhile…':'Your dialogue here',x:60,y:60,w:300,h:180,fontSize:30,tail:chosenStyle==='caption'?'none':'left',tailLength:30};panel().bubbles.push(b);bubbleId=b.id;changed();render();$('dialogue').focus();$('dialogue').select();};
for(const [id,key,numeric] of [['dialogue','text',false],['fontSize','fontSize',true],['bubbleWidth','w',true],['bubbleHeight','h',true],['tail','tail',false],['tailLength','tailLength',true],['bubbleStyle','style',false]]){
  $(id).addEventListener('input',()=>{const b=bubble();if(!b)return;let value=numeric?Number($(id).value):$(id).value;if(numeric){if(!Number.isFinite(value))return;const limits={fontSize:[14,72],w:[120,650],h:[80,500],tailLength:[0,300]}[key];value=Math.max(limits[0],Math.min(limits[1],value));}b[key]=value;b.x=Math.min(b.x,720-b.w);b.y=Math.min(b.y,720-b.h);changed();const el=document.querySelector('.bubble.active');el.style.width=b.w/7.2+'%';el.style.height=bubbleRenderHeight(b)/7.2+'%';el.style.left=b.x/7.2+'%';el.style.top=b.y/7.2+'%';el.innerHTML=bubbleSVG(b);$('tailLengthValue').textContent=tailLength(b)+' px';$('tailLength').disabled=!hasTail(b);});
}
$('deleteBubble').onclick=()=>{panel().bubbles=panel().bubbles.filter(b=>b.id!==bubbleId);bubbleId=null;changed();render();};
$('removeImage').onclick=()=>{panel().image=null;changed();render();};
$('imageFit').onchange=()=>{panel().fit=$('imageFit').value;changed();render();};
$('pageName').oninput=()=>{project.name=$('pageName').value;changed();};
$('savePage').onclick=async()=>{const savingRevision=revision;$('savePage').disabled=true;try{project.name=project.name.trim()||'Untitled page';await api('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(project)});if(revision===savingRevision){dirty=false;$('saveState').textContent='Saved to projects folder';}toast('Page saved — reopen it anytime');}catch(error){toast(error.message);}finally{$('savePage').disabled=false;}};
function canReplace(){return !dirty||confirm('This page has unsaved changes. Continue without saving it to the projects folder?');}
$('newPage').onclick=()=>{if(!canReplace())return;project=fresh();panelIndex=0;bubbleId=null;changed();render();};
$('openPage').onclick=async()=>{try{const projects=await api('/api/projects');$('projectList').replaceChildren();for(const item of projects){const button=document.createElement('button');button.textContent=item.name;button.onclick=async()=>{if(!canReplace())return;try{project=await api('/api/projects/'+encodeURIComponent(item.id));panelIndex=0;bubbleId=null;changed();dirty=false;render();$('saveState').textContent='Opened from projects folder';$('projectDialog').close();}catch(error){toast(error.message);}};$('projectList').append(button);}if(!projects.length)$('projectList').textContent='No saved pages yet. Save your first page to see it here.';$('projectDialog').showModal();}catch(error){toast(error.message);}};
$('closeDialog').onclick=()=>$('projectDialog').close();
function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Could not load artwork. Check the images folder.'));img.src=src;});}
function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
$('exportPage').onclick=async()=>{
  const snapshot=JSON.parse(JSON.stringify(project));
  $('exportPage').disabled=true;try{
    const canvas=document.createElement('canvas'),margin=24,gap=16;canvas.width=1504;canvas.height=2240;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
    for(let i=0;i<6;i++){
      const p=snapshot.panels[i],x=margin+(i%2)*(720+gap),y=margin+Math.floor(i/2)*(720+gap);ctx.save();ctx.beginPath();ctx.rect(x,y,720,720);ctx.clip();ctx.fillStyle='#f3f2ee';ctx.fillRect(x,y,720,720);
      if(p.image){const img=await loadImage(p.image);const scale=(p.fit==='contain'?Math.min:Math.max)(720/img.width,720/img.height);ctx.drawImage(img,x+(720-img.width*scale)/2,y+(720-img.height*scale)/2,img.width*scale,img.height*scale);}
      for(const b of p.bubbles){const url=URL.createObjectURL(new Blob([bubbleSVG(b)],{type:'image/svg+xml'}));try{const img=await loadImage(url);ctx.drawImage(img,x+b.x,y+b.y,b.w,bubbleRenderHeight(b));}finally{URL.revokeObjectURL(url);}}
      ctx.restore();ctx.strokeStyle='#161616';ctx.lineWidth=4;ctx.strokeRect(x+2,y+2,716,716);
    }
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Could not export page');download(blob,(snapshot.name.replace(/[^a-z0-9_-]/gi,'-')||'comic-page')+'.png');toast('PNG exported · 1504 × 2240 pixels');
  }catch(error){toast(error.message);}finally{$('exportPage').disabled=false;}
};
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='s'){event.preventDefault();$('savePage').click();}});
render();refreshImages();if(dirty)$('saveState').textContent='Restored browser draft · save to keep a project file';
