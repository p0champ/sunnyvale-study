import {createLecturePlayer} from './lecture-player.js?v=build-a-1';
import {speechLanguage} from './study-utils.js';
export function installJarvisLayer(ctx){
 const {THREE,scene,panels,readJSON,writeJSON,holoLabel,touchables,makeHoloObject,placeInFront,worldTool,thesis}=ctx;
 const key='sunnyvale.session-replay.v1',saved=readJSON(key,{sessions:[]});let sessions=saved.sessions||[],events=[],started=Date.now(),lastSample=0,lastSave=0,lastNudge=0,replay=null,replayDetails=null,narrator=null,stopped=false;
 const known=new Map(),seen=new Set(readJSON('sunnyvale.nudges.seen',[]));let nudges=readJSON('sunnyvale.nudges.enabled',true);
 const pos=()=>ctx.viewerPosition(new THREE.Vector3()).toArray();
 const record=(kind,data={})=>{if(stopped)return;events.push({kind,at:Date.now(),position:pos(),...data});events=events.slice(-400);};
 function persist(){writeJSON(key,{sessions:[...sessions,{started,events}].slice(-8)});}
 function finish(){persist();stopped=true;narrator?.stop();}
 function start(){if(events.length)sessions=[...sessions,{started,events}].slice(-7);events=[];started=Date.now();known.clear();stopped=false;record('session-start');}
 function point({id,part}){
  const p=ctx.findWindow(id);if(!p)throw Error('Window no longer exists.');
  ctx.reveal(p);
  if(p.userData.nodes&&part!==undefined&&!p.userData.nodes[String(part)])throw Error('Use an exact node label or branch:i/child:j id.');
  if(p.userData.eventDots&&part!==undefined){const matches=Number.isInteger(part)?[p.userData.eventDots[part]].filter(Boolean):p.userData.eventDots.filter(m=>m.userData.event?.label===part||m.userData.event?.year===String(part));if(matches.length!==1)throw Error('Use one exact event index, unique year or full label.');part=p.userData.eventDots.indexOf(matches[0]);}
  return thesis.tools.point_at({id,part});
 }
 function suggestion({quote_id,window_id,reason,kind='possible match'}){
  const quotes=readJSON('sunnyvale.quotes',[]),q=quotes.find(q=>q.id===quote_id),p=ctx.findWindow(window_id);if(!q||!p)throw Error('Choose an existing quote and window.');if(!reason)throw Error('Explain why this connection matters.');
  const pair=quote_id+':'+window_id+':'+kind;if(seen.has(pair))return {shown:false,reason:'Already suggested'};
  seen.add(pair);writeJSON('sunnyvale.nudges.seen',[...seen].slice(-200));lastNudge=Date.now();
  const w=ctx.openWindow('Possible connection',String(reason).slice(0,800)+'\n\nSaved quote: '+String(q.text||q.quote||'').slice(0,1400)+'\n\nCheck the source before using this as evidence.');w.userData.noSave=true;point({id:window_id});record('connection',{title:p.userData.title});return {shown:true,id:w.userData.id,kind};
 }
 function automaticNudge(){
  if(!nudges||Date.now()-lastNudge<5*60000||ctx.voiceActive()||replay)return;
  const quotes=readJSON('sunnyvale.quotes',[]).slice(-100),windows=panels.filter(p=>!p.userData.noSave&&/script|scene|thesis/i.test(p.userData.title||''));
  for(const p of windows){const words=new Set(String(p.userData.body||'').toLowerCase().match(/[a-z]{5,}/g)||[]);for(const q of quotes){const common=[...new Set(String(q.text||q.quote||'').toLowerCase().match(/[a-z]{5,}/g)||[])].filter(w=>words.has(w));if(common.length>=3&&!seen.has(q.id+':'+p.userData.id+':possible match')){suggestion({quote_id:q.id,window_id:p.userData.id,reason:'Possible thematic link: '+common.slice(0,4).join(', ')+'. Review this saved quote alongside '+p.userData.title+'.'});return;}}}
 }
 function makeReplay({session=-1,walking=false}={}){
  const history=[...sessions,{started,events}],data=history[session<0?history.length+session:session];if(!data?.events.length)throw Error('No recorded session at that index.');
  if(replay?.parent)ctx.closeWindow(replay);const group=new THREE.Group();replay=makeHoloObject(group,.9,.45,'Session replay','session-replay');replay.userData.noSave=true;placeInFront(replay,1.2,-.05);replay.userData.popIn=undefined;replay.updateMatrixWorld(true);
  const entries=data.events,points=entries.map(e=>replay.worldToLocal(new THREE.Vector3(e.position[0],.06,e.position[2]))),line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xd97757,transparent:true,opacity:.65}));group.add(line);
  const marker=new THREE.Mesh(new THREE.SphereGeometry(.025,12,8),new THREE.MeshBasicMaterial({color:0xf3c4a7}));group.add(marker);
  let index=0,label;
  const select=i=>{index=Math.max(0,Math.min(entries.length-1,i));const e=entries[index];marker.position.copy(points[index]);if(label){group.remove(label);label.geometry.dispose();label.material.map.dispose();label.material.dispose();}label=holoLabel((index+1)+'/'+entries.length+' '+e.kind+' '+String(e.title||'').slice(0,40),{w:.78,h:.1,fill:'rgba(23,29,38,.96)'});label.position.y=.05;group.add(label);replay.userData.body=JSON.stringify(e);const detail=[new Date(e.at).toLocaleTimeString()+' · '+e.kind,e.title||'',e.text||'',e.words!==undefined?e.words+' words ('+(e.delta>=0?'+':'')+(e.delta||0)+' changed)':'',e.target?'Window position: '+e.target.map(x=>x.toFixed(2)).join(', '):''].filter(Boolean).join('\n\n');if(!replayDetails?.parent){replayDetails=ctx.openWindow('Replay step',detail);replayDetails.userData.noSave=true;replayDetails.position.copy(replay.position).add(new THREE.Vector3(.85,0,0));replayDetails.quaternion.copy(replay.quaternion);}else ctx.setWindowContent(replayDetails,'Replay step',detail);replay.userData.selected=index;return e;};
  for(const [text,x,dir] of [['BACK',-.25,-1],['NEXT',.25,1]]){const b=holoLabel(text,{w:.18,h:.06});b.position.set(x,-.13,.01);group.add(b);touchables.push({mesh:b,w:.18,h:.06,owner:replay,action:()=>select(index+dir)});}
  const owner=replay;owner.userData.walking=!!walking;owner.userData.onClose=()=>{if(replayDetails?.parent)ctx.closeWindow(replayDetails);replayDetails=null;if(replay===owner)replay=null;group.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});};owner.userData.selectStep=select;owner.userData.steps=entries;select(0);return {id:owner.userData.id,steps:entries.length};
 }
 const tools={
  open_jarvis_controls:()=>{const g=new THREE.Group(),p=makeHoloObject(g,.65,.36,'Jarvis','jarvis-controls');p.userData.noSave=true;[['REPLAY',()=>makeReplay()],['NUDGES '+(nudges?'ON':'OFF'),()=>{nudges=!nudges;writeJSON('sunnyvale.nudges.enabled',nudges);ctx.announce('NUDGES '+(nudges?'ON':'OFF'));}],['STOP NARRATION',()=>narrator?.stop()]].forEach(([text,action],i)=>{const b=holoLabel(text,{w:.48,h:.065});b.position.set(0,.1-i*.09,.01);g.add(b);touchables.push({mesh:b,w:.48,h:.065,owner:p,action});});placeInFront(p,.8,-.05);return JSON.stringify({id:p.userData.id});},
  point_at:input=>point(input),
  narrate_path:({steps})=>{if(!Array.isArray(steps)||!steps.length||steps.length>40)throw Error('Use 1–40 narration steps.');for(const s of steps){if(!s.text)throw Error('Each step needs spoken text.');point(s);}narrator?.stop();const slides=steps.map(s=>({spoken_text:s.text,pause_seconds:s.pause_seconds||0}));narrator=createLecturePlayer({speech:window.speechSynthesis,Utterance:window.SpeechSynthesisUtterance,language:speechLanguage(),slides,go:i=>{point(steps[i]);ctx.announce(steps[i].text.slice(0,100));},notice:ctx.announce});return JSON.stringify({started:narrator.start(),voice:'device',steps:steps.length});},
  stop_narration:()=>{narrator?.stop();return JSON.stringify({stopped:true});},
  suggest_connection:input=>JSON.stringify(suggestion(input)),
  set_nudges:({enabled})=>{nudges=!!enabled;writeJSON('sunnyvale.nudges.enabled',nudges);return JSON.stringify({enabled:nudges});},
  session_events:()=>JSON.stringify({started,events,sessions:sessions.map(s=>({started:s.started,events:s.events.length}))}),
  replay_session:input=>JSON.stringify(makeReplay(input)),
  set_replay_walking:({enabled})=>{if(!replay?.parent)throw Error('Open replay first.');replay.userData.walking=!!enabled;return JSON.stringify({walking:!!enabled});},
  replay_step:({index})=>{if(!replay?.parent)throw Error('Open replay_session first.');if(!Number.isInteger(index))throw Error('Use an integer step index.');return JSON.stringify(replay.userData.selectStep(index));},
  fill_room:async({topic,summary='',branches=[],people=[],timeline=[],sources=[],questions=[]})=>{
   if(!topic)throw Error('Provide a topic and researched material. This tool does not invent research.');if(branches.length>8||timeline.length>16||sources.length>20||people.length>20||questions.length>20)throw Error('Keep each research group within its stated limits.');
   const made=[];const add=async(name,input)=>{const r=JSON.parse(await worldTool(name,input));if(r.id)made.push(r.id);await new Promise(r=>setTimeout(r,0));};
   if(summary)await add('open_window',{title:topic+' — overview',body:summary});if(branches.length)await add('create_mind_map',{title:topic,branches});if(people.length)await add('open_window',{title:topic+' — key figures',body:people.join('\n\n')});if(timeline.length)await add('create_timeline',{title:topic+' — timeline',events:timeline});if(sources.length)await add('open_window',{title:topic+' — sources',body:sources.map(s=>typeof s==='string'?s:JSON.stringify(s)).join('\n\n')});if(questions.length)await add('open_window',{title:topic+' — open questions',body:questions.join('\n\n')});
   if(!made.length)throw Error('Supply overview, branches, figures, timeline, sources or questions from your research.');thesis.tools.arrange_windows({layout:made.map((id,i)=>({id,place:['front','left','right','far-left','far-right','above'][i]}))});record('fill-room',{title:topic});ctx.announce('ROOM READY: '+topic);return JSON.stringify({ids:made,source:'Caller-supplied research; verify claims against the supplied sources.'});
  }
 };
 function updateReplay(){if(!replay?.parent||!replay.userData.walking)return;const here=pos(),entries=replay.userData.steps;let nearest=-1,dist=.2;entries.forEach((e,i)=>{const d=Math.hypot(e.position[0]-here[0],e.position[2]-here[2]);if(d<dist){dist=d;nearest=i;}});if(nearest>=0&&nearest!==replay.userData.lastWalk){replay.userData.selectStep(nearest);replay.userData.lastWalk=nearest;}}
 function update(){updateReplay();if(stopped)return;const now=performance.now();if(now-lastSample<1000)return;lastSample=now;
  const live=new Set();for(const p of ctx.allPanels()){if(p.userData.noSave)continue;const id=p.userData.id||p.userData.browserId;if(!id)continue;live.add(id);const old=known.get(id),position=p.position.toArray(),stashed=!panels.includes(p);if(!old)record('opened',{id,title:p.userData.title,text:String(p.userData.body||'').slice(0,1200),target:position});else if(old.stashed!==stashed)record(stashed?'stashed':'restored',{id,title:p.userData.title});else if(Math.hypot(...position.map((v,i)=>v-old.position[i]))>.25)record('moved',{id,title:p.userData.title,target:position});const text=String(p.userData.body||''),count=(text.match(/[\p{L}\p{N}]+/gu)||[]).length;if(old&&old.text!==text)record('edited',{id,title:p.userData.title,words:count,delta:count-old.words,text:text.slice(0,2500)});known.set(id,{position,stashed,text,words:count});}
  for(const id of known.keys())if(!live.has(id)){record('closed',{id});known.delete(id);}
  const here=pos(),last=events.at(-1);if(last&&Math.hypot(here[0]-last.position[0],here[2]-last.position[2])>.35)record('walk');

  if(now-lastSave>5000&&!ctx.voiceActive()){lastSave=now;persist();automaticNudge();}
 }
 window.addEventListener('pagehide',persist); record('session-start');
 return {tools,update,finish,start,record,help:{fill_room:{description:'Supply researched overview, branches, people, timeline, sources and questions; no autonomous factual lookup or invention.'},narrate_path:{description:'Whole-path device-voice explanation while the orb points at exact window parts.'},replay_session:{description:'Explicit interactive session trail; not ambient decoration. Back/next works seated, or enable walking for the first step at each distinct location; use BACK/NEXT for several events in one location.'}}};
}
