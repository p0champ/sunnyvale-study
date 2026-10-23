export const TASK_MODES = {
  thesis: { color: '#91bfea', match: /thesis|source|quote|bibliography|analysis|pdf|counter|film_globe|money_flow|propaganda_radar|argument_tower|strength_glow/i, menu: [['Thesis','thesis'],['Library','library'],['Quotes','quotes'],['Sources','sources'],['Deadlines','deadlines']] },
  script: { color: '#dfb478', match: /script|scene|storyboard|character|beat|camera|light|tension|block_actors|film_set/i, menu: [['Draft','draft'],['Scenes','scenes'],['Notes','notes'],['Library','library']] },
  ideas: { color: '#d97757', match: /map|idea|belief|assumption|influence|bias|echo|lineage|steelman/i, menu: [['Mind map','map'],['Notes','notes'],['Flashcards','cards']] },
  reading: { color: '#c8c5bb', match: /pdf|reading|poem|book|quote/i, menu: [['Library','library'],['Quotes','quotes'],['Reading log','reading'],['Poem shelf','poems']] },
  exam: { color: '#c7cbd0', match: /exam|counter|timer|feedback/i, menu: [['Rehearse','exam'],['Counterpoints','counters'],['Focus timer','timer']] },
  'film-study': { color: '#c7cbd0', match: /video|frame|shot|film|storyboard|analysis/i, menu: [['Library','library'],['Shot log','shots'],['Analysis','analysis']] }
};
export function installTaskModes(ctx) {
  const {THREE,scene,camera,renderer,panels,allPanels,readJSON,writeJSON,makeHoloObject,holoLabel,touchables,placeInFront,faceViewer,markDirty,announce}=ctx;
  const key='sunnyvale.task-modes.v1';
  const readingKey='sunnyvale.reading.v1';
  function readingShelf(){const entries=readJSON(readingKey,[]);const dates=new Set(entries.map(x=>x.date));let streak=0;const day=new Date();for(let i=0;i<3660;i++){const date=[day.getFullYear(),String(day.getMonth()+1).padStart(2,'0'),String(day.getDate()).padStart(2,'0')].join('-');if(!dates.has(date)){if(i===0){day.setDate(day.getDate()-1);continue;}break;}streak++;day.setDate(day.getDate()-1);}return {streak,entries};}
  const saved=readJSON(key,{current:'thesis',layouts:{},brightness:1,surfaces:{}});
  let current=TASK_MODES[saved.current]?saved.current:'thesis', picker;
  const layouts=saved.layouts||{}, surfaces=saved.surfaces||{}, shadows=new Map();
  let brightness=Math.max(.4,Math.min(1.6,Number(saved.brightness)||1)),lastSave=0;
  const id=p=>p.userData.browserId?'browser:'+p.userData.browserId:(p.userData.id||p.uuid);
  const pose=p=>({p:p.position.toArray(),q:p.quaternion.toArray(),s:p.scale.toArray(),visible:p.visible&&panels.includes(p),stashed:!panels.includes(p)});
  function capture(){layouts[current]=Object.fromEntries(allPanels().filter(p=>!p.userData.noSave).map(p=>[id(p),pose(p)]));}
  function restorePose(p,s){if(s.stashed)ctx.stash(p);else ctx.reveal(p);p.position.fromArray(s.p);p.quaternion.fromArray(s.q);p.scale.fromArray(s.s);p.visible=!s.stashed&&s.visible;p.userData.popIn=undefined;p.userData.fly=p.userData.away=null;}
  function persist(){writeJSON(key,{current,layouts,brightness,surfaces});}
  function applyMode(name,{announceChange=true}={}) {
    name=String(name||'').toLowerCase().replace(/ mode$/,'').replace(/\s+/g,'-');
    if(!TASK_MODES[name])throw Error('Choose thesis, script, ideas, reading, exam or film-study.');
    capture();current=name;ctx.setEnvironment('stark');
    for(const p of [...panels])if(p.userData.title==='Sunnyvale Study'&&!p.userData.id)ctx.closeWindow(p);
    const layout=layouts[name], relevant=allPanels().filter(p=>!p.userData.noSave&&TASK_MODES[name].match.test(p.userData.kind+' '+p.userData.title));
    if(layout){for(const p of allPanels()){const s=layout[id(p)];if(s)restorePose(p,s);else if(relevant.includes(p))ctx.reveal(p);}}
    else relevant.forEach((p,i)=>{ctx.reveal(p);const a=(i-(relevant.length-1)/2)*.55;const v=ctx.viewerPosition(new THREE.Vector3());const forward=ctx.viewDirection();const yaw=Math.atan2(-forward.x,-forward.z)+a;p.position.set(v.x-Math.sin(yaw)*1.35,v.y-.08,v.z-Math.cos(yaw)*1.35);faceViewer(p);});
    ctx.setMenu(current,TASK_MODES[current]);ctx.repaint();persist();markDirty();
    if(announceChange)announce('MODE: '+current.replace('-',' ').toUpperCase());
    return {mode:current,restored:!!layout,windows:relevant.map(id)};
  }
  function button(parent,label,x,y,w,action){const mesh=holoLabel(label,{w,h:.07,color:'#f2ece6',fill:'rgba(20,25,32,.94)'});mesh.position.set(x,y,.01);parent.add(mesh);touchables.push({mesh,w,h:.07,owner:parent,action});}
  function openPicker(){
    if(picker?.parent){ctx.closeWindow(picker);picker=null;return;}
    const content=new THREE.Group();picker=makeHoloObject(content,.75,.46,'Task mode','mode-picker');picker.userData.noSave=true;
    Object.keys(TASK_MODES).forEach((name,i)=>button(content,name.replace('-',' ').toUpperCase(),(i%2?1:-1)*.18,.13-Math.floor(i/2)*.11,.32,()=>{applyMode(name);ctx.closeWindow(picker);picker=null;}));placeInFront(picker,.7,-.05);
  }
  const tintCanvas=document.createElement('canvas');tintCanvas.width=tintCanvas.height=128;
  const tintTexture=new THREE.CanvasTexture(tintCanvas),tint=new THREE.Mesh(new THREE.PlaneGeometry(2.2,2.2),new THREE.MeshBasicMaterial({map:tintTexture,transparent:true,depthTest:false,depthWrite:false}));tint.position.z=-1;tint.renderOrder=999;camera.add(tint);if(!camera.parent)scene.add(camera);
  let lastColor='';
  function update(dt){
    const color=TASK_MODES[current].color;
    tint.visible=ctx.getEnvironment()==='stark';
    if(lastColor!==color){const g=tintCanvas.getContext('2d'),r=g.createRadialGradient(64,64,30,64,64,88);r.addColorStop(0,'transparent');r.addColorStop(.75,'transparent');r.addColorStop(1,color+'13');g.clearRect(0,0,128,128);g.fillStyle=r;g.fillRect(0,0,128,128);tintTexture.needsUpdate=true;lastColor=color;}
    const focus=ctx.focusWindow();
    for(const p of allPanels()){
      if(p.userData.noSave)continue;
      if(!shadows.has(p)){
        const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,2,32,32,32);r.addColorStop(0,'rgba(0,0,0,.24)');r.addColorStop(1,'transparent');g.fillStyle=r;g.fillRect(0,0,64,64);
        const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.85,.45),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false}));mesh.rotation.x=-Math.PI/2;scene.add(mesh);shadows.set(p,mesh);
      }
      if(!p.userData.taskOutline){const {w=.8,h=.55}=p.userData.size||{};const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-w/2,-h/2,.008),new THREE.Vector3(w/2,-h/2,.008),new THREE.Vector3(w/2,h/2,.008),new THREE.Vector3(-w/2,h/2,.008)]);p.userData.taskOutline=new THREE.LineLoop(geo,new THREE.LineBasicMaterial({color,transparent:true,opacity:.65,depthWrite:false}));p.add(p.userData.taskOutline);}p.userData.taskOutline.visible=tint.visible&&p===focus;p.userData.taskOutline.material.color.set(color);
      const sh=shadows.get(p);sh.visible=tint.visible&&p.visible&&panels.includes(p);const level=Math.max(0,...Object.values(surfaces).filter(s=>s.normal[1]>.7&&s.position[1]<p.position.y&&Math.hypot(s.position[0]-p.position.x,s.position[2]-p.position.z)<1).map(s=>s.position[1]));sh.position.set(p.position.x,level+.008,p.position.z);sh.scale.setScalar(Math.min(2,p.scale.x));
      if(p.userData.bubbleTex&&p.material?.color){const warm=new Date().getHours()>=18;const target=new THREE.Color(p===focus?color:warm?'#fff4e9':'#ffffff').multiplyScalar(brightness);p.material.color.lerp(target,Math.min(1,dt*5));}
    }
    for(const [p,sh] of shadows)if(!p.parent){scene.remove(sh);sh.geometry.dispose();sh.material.map.dispose();sh.material.dispose();shadows.delete(p);p.userData.taskOutline?.geometry.dispose();p.userData.taskOutline?.material.dispose();}
    if(performance.now()-lastSave>5000&&!ctx.voiceActive()){lastSave=performance.now();capture();persist();}
  }
  window.addEventListener('pagehide',()=>{capture();persist();});
  ctx.setMenu(current,TASK_MODES[current]);
  const tools={
    record_reading:({title,minutes=0,words=0,poem=''})=>{if(!title||!Number.isFinite(minutes)||minutes<0||!Number.isFinite(words)||words<0)throw Error('Provide a title and non-negative minutes/words.');const entries=readJSON(readingKey,[]),d=new Date(),date=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');entries.push({date,title:String(title).slice(0,200),minutes,words,poem:String(poem).slice(0,12000)});writeJSON(readingKey,entries.slice(-1000));return JSON.stringify(readingShelf());},
    open_reading_shelf:()=>{const r=readingShelf();const p=ctx.openWindow('Reading and poem shelf',r.streak+' day reading streak\n\n'+r.entries.slice(-20).reverse().map(e=>e.date+' · '+e.title+' · '+e.minutes+' min · '+e.words+' words'+(e.poem?'\n'+e.poem:'')).join('\n\n'));return JSON.stringify({id:p.userData.id,streak:r.streak});},
    switch_mode:({mode})=>JSON.stringify(applyMode(mode)),
    list_modes:()=>JSON.stringify({current,modes:Object.keys(TASK_MODES),look:ctx.getLook()}),
    set_room_brightness:({value})=>{if(!Number.isFinite(value)||value<.4||value>1.6)throw Error('Brightness must be 0.4–1.6.');brightness=value;persist();return JSON.stringify({brightness});},
    calibrate_surface:({name,position,normal=[0,1,0]})=>{if(!name||!Array.isArray(position)||position.length!==3||!position.every(Number.isFinite)||!Array.isArray(normal)||normal.length!==3||!normal.every(Number.isFinite)||Math.hypot(...normal)<.1)throw Error('Provide a name and measured position/normal in room metres.');surfaces[name]={position,normal};persist();return JSON.stringify({saved:name,note:'User-calibrated surface, not automatic room detection.'});},
    snap_to_surface:({id:target,surface,offset=.04})=>{const p=ctx.findWindow(target),s=surfaces[surface];if(!p||!s)throw Error('Window or calibrated surface not found.');const n=new THREE.Vector3(...s.normal).normalize();p.position.fromArray(s.position).addScaledVector(n,Math.max(.005,Math.min(.5,Number(offset)||.04)));if(Math.abs(n.y)<.7)p.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),n);else faceViewer(p);p.userData.popIn=undefined;capture();persist();markDirty();return JSON.stringify({id:target,surface});}
  };
  return {tools,update,openPicker,applyMode,get brightness(){return brightness;},get current(){return current;},capture,restoreCurrent(){const layout=layouts[current];if(layout)for(const p of allPanels()){const s=layout[id(p)];if(s)restorePose(p,s);}},help:{switch_mode:{description:'Switch task and restore its saved room layout; tell the user when changing modes.'},calibrate_surface:{description:'Save a user-measured desk or wall plane. Never claim this is room scanning.'}}};
}
