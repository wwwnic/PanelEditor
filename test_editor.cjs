const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {randomUUID} = require('node:crypto');

function editor() {
  const elements = new Map();
  const context = {measureText:text=>({width:text.length*15}),fillRect(){},save(){},beginPath(){},rect(){},clip(){},restore(){},strokeRect(){},drawImage(){}};
  const element = () => ({value:'',style:{},dataset:{},previousElementSibling:{addEventListener(){}},classList:{toggle(){}},replaceChildren(){},append(){},setAttribute(){},addEventListener(){},focus(){},select(){},click(){},toBlob:fn=>fn(new Blob(['png'])),getContext:()=>context});
  const sandbox = vm.createContext({console,Blob,URL,crypto:{randomUUID},setTimeout:()=>0,clearTimeout(){},localStorage:{getItem:()=>null,setItem(){}},window:{addEventListener(){}},document:{getElementById:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element,querySelectorAll:()=>[],addEventListener(){}},fetch:async()=>({ok:true,json:async()=>[]})});
  vm.runInContext(fs.readFileSync('dist/app.js','utf8'),sandbox);
  vm.runInContext('render=()=>{};refreshImages=async()=>{};',sandbox);
  return {run:code=>vm.runInContext(code,sandbox),sandbox,elements,context};
}

test('an upload stays with its original panel when selection changes',async()=>{
  const e=editor();let release;
  e.sandbox.uploadGate=new Promise(resolve=>release=resolve);
  e.run("api=async()=>{await uploadGate;return {url:'/images/new.png'};};");
  const upload=e.run("uploadFiles([{name:'new.png',type:'image/png'}],true)");
  e.run('panelIndex=1;');release();await upload;
  assert.equal(e.run('project.panels[0].image'),'/images/new.png');
  assert.equal(e.run('project.panels[1].image'),null);
});

test('an export uses the page snapshot even when another page opens',async()=>{
  const e=editor();let release;const draws=[];
  e.context.drawImage=(image)=>draws.push(image.src);
  e.sandbox.imageGate=new Promise(resolve=>release=resolve);
  e.run("project.name='Original';project.panels[0].image='/images/first.png';project.panels[1].image='/images/second.png';loadImage=async src=>{await imageGate;return {src,width:720,height:720};};download=(blob,name)=>{exportedName=name;};");
  const exporting=e.elements.get('exportPage').onclick();
  e.run("project=fresh();project.name='Other';");release();await exporting;
  assert.deepEqual(draws,['/images/first.png','/images/second.png']);
  assert.equal(e.run('exportedName'),'Original.png');
});

test('extending a tail preserves the bubble body and moves its tip',()=>{
  const e=editor();
  e.run("sample={w:300,h:180,fontSize:30,text:'Hello',style:'speech',tail:'left'};");
  const original=e.run('bubbleSVG(sample)');
  const extended=e.run('bubbleSVG({...sample,tailLength:160})');
  assert.match(original, /cy="75"/);
  assert.match(extended, /cy="75"/);
  assert.match(extended, /height="310"/);
  assert.match(extended, /L 24 307/);
  assert.notEqual(original,extended);
  assert.equal(e.run('bubbleRenderHeight({...sample,tailLength:160})'),310);
  assert.equal(e.run("bubbleRenderHeight({...sample,tail:'none',tailLength:160})"),180);
});
