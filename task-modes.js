export const TASK_MODES = {
  thesis: { color: '#91bfea', match: /thesis|source|quote|bibliography|analysis|pdf|counter/i, menu: [['Thesis','thesis'],['Library','library'],['Quotes','quotes'],['Sources','sources'],['Deadlines','deadlines']] },
  script: { color: '#dfb478', match: /script|scene|storyboard|character|beat|camera|light|tension/i, menu: [['Draft','draft'],['Notes','notes'],['Library','library']] },
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
  const pose=p=>({p:p.position.toArray(),q:p.quaternion.toArray(),s:p.scale.toArray(),visible:p.visible});
  function capture(){layouts[current]=Object.fromEntries(allPanels().filter(p=>!p.userData.noSave).map(p=>[id(p),pose(p)]));}
  function persist(){writeJSON(key,{current,layouts,brightness,surfaces});}
  function applyMode(name,{announceChange=true}={}) {
    name=String(name||'').toLowerCase().replace(/ mode$/,'').replace(/\s+/g,'-');
    if(!TASK_MODES[name])throw Error('Choose thesis, script, ideas, reading, exam or film-study.');
    capture();current=name;ctx.setEnvironment('stark');
    const layout=layouts[name], relevant=panels.filter(p=>!p.userData.noSave&&TASK_MODES[name].match.test(p.userData.kind+' '+p.userData.title));
    if(layout){for(const p of allPanels()){const s=layout[id(p)];if(s){ctx.reveal(p);p.position.fromArray(s.p);p.quaternion.fromArray(s.q);p.scale.fromArray(s.s);p.visible=s.visible;p.userData.popIn=undefined;p.userData.fly=p.userData.away=null;}}}
    else relevant.forEach((p,i)=>{ctx.reveal(p);const a=(i-(relevant.length-1)/2)*.55;const v=ctx.viewerPosition(new THREE.Vector3());const forward=ctx.viewDirection();const yaw=Math.atan2(-forward.x,-forward.z)+a;p.position.set(v.x-Math.sin(yaw)*1.35,v.y-.08,v.z-Math.cos(yaw)*1.35);faceViewer(p);});
    ctx.setMenu(current,TASK_MODES[current]);persist();markDirty();
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
      const sh=shadows.get(p);sh.visible=tint.visible&&p.visible&&panels.includes(p);sh.position.set(p.position.x,.008,p.position.z);sh.scale.setScalar(Math.min(2,p.scale.x));
      if(p.userData.bubbleTex&&p.material?.color){const warm=new Date().getHours()>=18;const target=new THREE.Color(p===focus?color:warm?'#fff4e9':'#ffffff').multiplyScalar(brightness);p.material.color.lerp(target,Math.min(1,dt*5));}
    }
    for(const [p,sh] of shadows)if(!p.parent){scene.remove(sh);sh.geometry.dispose();sh.material.map.dispose();sh.material.dispose();shadows.delete(p);}
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
  return {tools,update,openPicker,applyMode,get current(){return current;},capture,restoreCurrent(){const layout=layouts[current];if(layout)for(const p of allPanels()){const s=layout[id(p)];if(s){p.position.fromArray(s.p);p.quaternion.fromArray(s.q);p.scale.fromArray(s.s);p.visible=s.visible;p.userData.popIn=undefined;}}},help:{switch_mode:{description:'Switch task and restore its saved room layout; tell the user when changing modes.'},calibrate_surface:{description:'Save a user-measured desk or wall plane. Never claim this is room scanning.'}}};
}
