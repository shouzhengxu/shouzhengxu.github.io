/* The page itself is a point cloud. Text is raster-sampled, then each sample
   becomes a WebGL point with its own trajectory through three-dimensional space. */
(() => {
  'use strict';
  const stage = document.getElementById('story');
  const canvas = document.getElementById('particle-canvas');
  const linkLayer = document.getElementById('particle-links');
  if (!stage || !canvas) return;
  const panels = [...document.querySelectorAll('[data-chapter]')];
  const chapterButtons = [...document.querySelectorAll('[data-go]')];
  const previous = document.getElementById('previous-chapter');
  const next = document.getElementById('next-chapter');
  const motionButton = document.getElementById('motion-toggle');
  const replayButton = document.getElementById('replay-transition');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 700px)');
  const hashes = ['portrait', 'path', 'questions', 'papers', 'practice', 'together'];
  const names = [['Portrait','开篇'], ['Education','求学'], ['Research','探索'], ['Publications','论文'], ['Project','实践'], ['Together','同行']];
  const colors = {ink:'#edf2f3',body:'#d9e6ed',muted:'#adc5d5',accent:'#aad3ed',rule:'#496779'};
  let chapter = Math.max(0, hashes.indexOf(location.hash.slice(1)));
  let paused = reducedMotion.matches;
  let renderer = null;
  let portraitPixels = null;
  let navigationTime = -Infinity;
  const language = () => document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';

  function selectedText(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    if (node.dataset.lang && node.dataset.lang !== language()) return '';
    if (node.tagName === 'BR') return '\n';
    return [...node.childNodes].map(selectedText).join('');
  }
  function updateControls() {
    const zh = language() === 'zh';
    document.title = zh ? '光字成篇 · 徐守正' : 'Written in Light · Shouzheng Xu';
    document.getElementById('chapter-count').textContent = `${String(chapter + 1).padStart(2,'0')} / 06`;
    document.getElementById('chapter-announcement').textContent = `${chapter + 1} / 6 — ${names[chapter][zh ? 1 : 0]}`;
    motionButton.textContent = zh ? (paused ? '继续' : '暂停') : (paused ? 'Resume' : 'Pause');
    motionButton.setAttribute('aria-label', zh ? (paused ? '继续粒子动态' : '暂停粒子动态') : (paused ? 'Resume particle motion' : 'Pause particle motion'));
    motionButton.setAttribute('aria-pressed', String(paused));
    replayButton.textContent = zh ? '重新聚合' : 'Reassemble';
    replayButton.disabled = paused;
    document.getElementById('navigation-instruction').textContent = zh ? '滚动，翻开下一篇 ↓' : 'Scroll to reassemble ↓';
    chapterButtons.forEach((button, i) => {
      if (i === chapter) button.setAttribute('aria-current','step');
      else button.removeAttribute('aria-current');
    });
    previous.disabled = chapter === 0;
    next.disabled = chapter === panels.length - 1;
  }
  function goTo(index, options = {}) {
    const target = Math.max(0, Math.min(panels.length - 1, index));
    if (target === chapter && !options.force) return;
    chapter = target;
    panels.forEach((panel, i) => { panel.hidden = i !== chapter; });
    updateControls();
    renderer?.rebuild(options.animate !== false);
    if (!options.fromHistory) {
      const url = new URL(location.href); url.hash = hashes[chapter];
      history.replaceState(null, '', url);
    }
    if (options.scroll !== false && scrollY > 0) scrollTo({top:0,behavior:'auto'});
  }
  chapterButtons.forEach(button => button.addEventListener('click', () => goTo(Number(button.dataset.go))));
  previous.addEventListener('click', () => goTo(chapter - 1));
  next.addEventListener('click', () => goTo(chapter + 1));
  replayButton.addEventListener('click', () => renderer?.replay());
  motionButton.addEventListener('click', () => { paused = !paused; renderer?.setPaused(paused); updateControls(); });
  reducedMotion.addEventListener('change', event => { paused = event.matches; renderer?.setPaused(paused); updateControls(); });
  document.addEventListener('languagechange', () => { updateControls(); renderer?.rebuild(true); });
  window.addEventListener('hashchange', () => {
    const i = hashes.indexOf(location.hash.slice(1));
    if (i >= 0) goTo(i, {fromHistory:true});
  });
  function canChangeVertically(direction) {
    const maxScroll = document.documentElement.scrollHeight - innerHeight;
    return maxScroll < 8 || (direction > 0 ? scrollY >= maxScroll - 3 : scrollY <= 3);
  }
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault(); goTo(chapter + (event.key === 'ArrowRight' ? 1 : -1));
    } else if (['ArrowDown','ArrowUp','PageDown','PageUp'].includes(event.key)) {
      const direction = ['ArrowDown','PageDown'].includes(event.key) ? 1 : -1;
      if (!canChangeVertically(direction)) return;
      event.preventDefault(); goTo(chapter + direction);
    } else if (event.key === 'Home') { event.preventDefault(); goTo(0); }
    else if (event.key === 'End') { event.preventDefault(); goTo(panels.length - 1); }
  });
  let wheelSum = 0, wheelTime = 0;
  window.addEventListener('wheel', event => {
    if (mobile.matches || event.ctrlKey || !canChangeVertically(Math.sign(event.deltaY))) { wheelSum = 0; return; }
    const now = performance.now();
    if (now - wheelTime > 180) wheelSum = 0;
    wheelTime = now; wheelSum += event.deltaY * (event.deltaMode === 1 ? 16 : 1);
    if (Math.abs(event.deltaY) > 2) event.preventDefault();
    if (now - navigationTime < 2000 || Math.abs(wheelSum) < 70) return;
    goTo(chapter + Math.sign(wheelSum)); navigationTime = now; wheelSum = 0;
  }, {passive:false});
  let touchStart = null;
  stage.addEventListener('touchstart', event => { touchStart = [event.touches[0].clientX,event.touches[0].clientY]; }, {passive:true});
  stage.addEventListener('touchend', event => {
    if (!touchStart || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - touchStart[0], dy = event.changedTouches[0].clientY - touchStart[1];
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.4) goTo(chapter + (dx < 0 ? 1 : -1));
    touchStart = null;
  }, {passive:true});
  goTo(chapter, {force:true,fromHistory:true,scroll:false});

  // This layout is shared by sampling and focusable link regions, so a link
  // remains in exactly the same place as the letters made from particles.
  function composePage() {
    const width = Math.round(stage.getBoundingClientRect().width);
    const narrow = width < 650;
    const zh = language() === 'zh';
    const family = zh ? '"Songti SC", "STSong", serif' : 'Georgia, "Times New Roman", serif';
    const latin = 'Georgia, "Times New Roman", serif';
    const scratch = document.createElement('canvas');
    const ctx = scratch.getContext('2d', {willReadFrequently:true});
    const minimumHeight = Math.max(410, innerHeight - document.querySelector('.experience-header').offsetHeight - document.querySelector('.experience-footer').offsetHeight);
    const contentWidth = Math.min(width - (narrow ? 10 : 80), chapter === 0 ? 840 : 790);
    const left = (width - contentWidth) / 2;
    const centered = chapter === 0;
    const specs = {
      name: {size:narrow ? (width < 310 ? 40 : 45) : 65,line:1.2,after:9,color:'ink'},
      subtitle: {size:narrow ? 22 : 24,line:1.4,after:25,color:'muted'},
      intro: {size:narrow ? 21 : 25,line:1.65,after:18,color:'body'},
      eyebrow: {size:narrow ? 15 : 16,line:1.5,after:16,color:'muted'},
      title: {size:narrow ? 40 : 57,line:1.23,after:narrow ? 31 : 33,color:'ink'},
      heading: {size:narrow ? 25 : 29,line:1.42,after:12,color:'ink'},
      body: {size:narrow ? 21 : 23,line:zh ? 1.8 : 1.55,after:23,color:'body'},
      statement: {size:narrow ? 30 : 38,line:1.6,after:30,color:'ink'},
      meta: {size:narrow ? 17 : 18,line:1.65,after:13,color:'muted'},
      authors: {size:narrow ? 17 : 18,line:1.65,after:18,color:'body'},
      paper: {size:narrow ? 23 : 27,line:1.45,after:14,color:'accent'},
      link: {size:narrow ? 18 : 21,line:1.6,after:15,color:'accent'}
    };
    function wrapped(text, maxWidth) {
      const lines = [];
      for (const paragraph of text.split('\n')) {
        const tokens = /[\u3400-\u9fff]/.test(paragraph) ? Array.from(paragraph) : paragraph.match(/\S+\s*/g) || [''];
        let line = '';
        for (const token of tokens) {
          if (ctx.measureText(line + token).width <= maxWidth) { line += token; continue; }
          if (line.trim()) lines.push(line.trimEnd());
          line = token.trimStart();
          if (ctx.measureText(line).width > maxWidth) {
            let fragment = '';
            for (const character of line) {
              if (ctx.measureText(fragment + character).width > maxWidth && fragment) { lines.push(fragment); fragment = ''; }
              fragment += character;
            }
            line = fragment;
          }
        }
        if (line || !lines.length) lines.push(line.trimEnd());
      }
      return lines;
    }
    const items = [];
    let cursor = 0;
    for (const element of panels[chapter].querySelectorAll('[data-particle]')) {
      const type = element.dataset.particle;
      if (type === 'portrait') {
        const imageHeight = narrow ? 180 : Math.min(215, Math.max(155, minimumHeight * .29));
        items.push({type,x:(width-imageHeight*.75)/2,y:cursor,width:imageHeight*.75,height:imageHeight});
        cursor += imageHeight + 22; continue;
      }
      if (type === 'rule') { items.push({type,x:left,y:cursor+3,width:contentWidth}); cursor += narrow ? 26 : 27; continue; }
      const spec = specs[type];
      const text = selectedText(element).trim();
      const weight = zh && !['paper','authors'].includes(type) ? '500' : '400';
      const font = `${weight} ${spec.size}px ${['paper','authors'].includes(type) ? latin : family}`;
      ctx.font = font;
      const lines = wrapped(text, contentWidth);
      const lineHeight = spec.size * spec.line;
      const boxes = [];
      for (const line of lines) {
        const lineWidth = ctx.measureText(line).width;
        const x = centered ? (width-lineWidth)/2 : left;
        items.push({type:'text',text:line,x,y:cursor,font,size:spec.size,color:colors[spec.color]});
        boxes.push({x,y:cursor,width:lineWidth,height:lineHeight});
        cursor += lineHeight;
      }
      if (element.tagName === 'A') items.push({type:'link',element,boxes,text});
      cursor += spec.after;
    }
    const paddingTop = narrow ? 25 : 28;
    const contentHeight = cursor;
    const height = Math.ceil(Math.max(minimumHeight, contentHeight + paddingTop * 2));
    const offset = Math.max(paddingTop, (height-contentHeight)/2);
    stage.style.height = `${height}px`;
    const sampling = 2;
    scratch.width = Math.ceil(width*sampling); scratch.height = Math.ceil(height*sampling);
    ctx.scale(sampling,sampling); ctx.textBaseline = 'top';
    const links = [];
    let portraitBox = null;
    for (const item of items) {
      if (item.type === 'text') { ctx.font=item.font; ctx.fillStyle=item.color; ctx.fillText(item.text,item.x,item.y+offset); }
      else if (item.type === 'portrait') portraitBox={...item,y:item.y+offset};
      else if (item.type === 'rule') {ctx.fillStyle=colors.rule;ctx.fillRect(item.x,item.y+offset,item.width,.7);}
      else if (item.type === 'link') {
        const x = Math.min(...item.boxes.map(box => box.x));
        const right = Math.max(...item.boxes.map(box => box.x + box.width));
        const y = item.boxes[0].y;
        const last = item.boxes[item.boxes.length - 1];
        links.push({x,y:y+offset,width:right-x,height:last.y+last.height-y,text:item.text,element:item.element});
        for (const box of item.boxes) {
          if (item.element.dataset.particle === 'link') {ctx.fillStyle=colors.rule;ctx.fillRect(box.x,box.y+offset+box.height-2,box.width,.7);}
        }
      }
    }
    const pixels = ctx.getImageData(0,0,scratch.width,scratch.height).data;
    const points = [];
    for (let y=0;y<scratch.height;y++) for (let x=0;x<scratch.width;x++) {
      const i=(y*scratch.width+x)*4, alpha=pixels[i+3]/255;
      if (alpha < .13) continue;
      points.push(x/sampling-width/2, height/2-y/sampling, 0, pixels[i]/255,pixels[i+1]/255,pixels[i+2]/255,alpha,.82);
    }
    if (portraitBox && portraitPixels) {
      const {rgba,w,h}=portraitPixels;
      for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
        const i=(y*w+x)*4;
        const darkness=1-(rgba[i]*.2126+rgba[i+1]*.7152+rgba[i+2]*.0722)/255;
        if(darkness<.10 || (x*13+y*7)%19/19 > Math.pow(darkness,.6))continue;
        points.push(portraitBox.x+x/w*portraitBox.width-width/2,height/2-(portraitBox.y+y/h*portraitBox.height),0,.65,.82,.93,Math.min(1,.4+darkness),1.23);
      }
    }
    linkLayer.replaceChildren();
    for (const link of links) {
      const a=document.createElement('a'); a.className='particle-link';
      a.href=link.element.href;
      if(link.element.target){a.target=link.element.target;a.rel='noopener noreferrer';}
      a.style.cssText=`left:${link.x}px;top:${link.y}px;width:${Math.max(8,link.width)}px;height:${link.height}px`;
      a.setAttribute('aria-label',link.text);
      const label=document.createElement('span');label.textContent=link.text;a.append(label);
      linkLayer.append(a);
    }
    return {width,height,points:new Float32Array(points)};
  }

  function createRenderer() {
    const gl=canvas.getContext('webgl',{alpha:true,antialias:false,depth:false,powerPreference:'low-power'});
    if(!gl)return null;
    const vertex=`
      attribute vec3 aFrom;
      attribute vec3 aTo;
      attribute vec3 aCloud;
      attribute vec4 aFromColor;
      attribute vec4 aToColor;
      attribute vec2 aSizes;
      uniform vec2 uViewport;
      uniform vec2 uPointer;
      uniform float uCamera;
      uniform float uPixelRatio;
      uniform float uProgress;
      uniform float uInitial;
      varying vec4 vColor;
      void main(){
        float exitAmount=uInitial>.5?1.0:smoothstep(0.0,.43,uProgress);
        float enterAmount=smoothstep(uInitial>.5?0.0:.34,1.0,uProgress);
        vec3 cloud=aCloud;
        cloud.xy+=uPointer*cloud.z*.16;
        vec3 p=mix(mix(aFrom,cloud,exitAmount),aTo,enterAmount);
        float depth=1.0-p.z/uCamera;
        gl_Position=vec4(p.x*2.0/uViewport.x,p.y*2.0/uViewport.y,0.0,depth);
        float wave=sin(uProgress*3.14159265);
        float size=mix(aSizes.x,aSizes.y,enterAmount);
        gl_PointSize=max(1.0,size*uPixelRatio*(1.0+.5*wave)/depth);
        vColor=mix(aFromColor,aToColor,smoothstep(.22,.83,uProgress));
        vColor.a=max(vColor.a,.46*wave);
        vColor.a*=clamp(1.15-depth*.15,.6,1.0);
      }
    `;
    const fragment=`
      precision mediump float;
      varying vec4 vColor;
      void main(){
        float radius=length(gl_PointCoord-vec2(.5));
        if(radius>.5)discard;
        float coverage=1.0-smoothstep(.32,.5,radius);
        gl_FragColor=vec4(vColor.rgb,coverage*vColor.a);
      }
    `;
    function compile(source,type){
      const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('Particle text shader unavailable');
      return shader;
    }
    const program=gl.createProgram(),vs=compile(vertex,gl.VERTEX_SHADER),fs=compile(fragment,gl.FRAGMENT_SHADER);
    gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Particle text renderer unavailable');
    gl.useProgram(program);gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(0,0,0,0);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    const attributes=[['aFrom',3,0],['aTo',3,3],['aCloud',3,6],['aFromColor',4,9],['aToColor',4,13],['aSizes',2,17]];
    for(const [name,size,offset] of attributes){const a=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,19*4,offset*4);}
    const uniforms={};for(const key of ['uViewport','uPointer','uCamera','uPixelRatio','uProgress','uInitial'])uniforms[key]=gl.getUniformLocation(program,key);
    let width=1,height=1,ratio=1,count=0,data=new Float32Array(0),target=new Float32Array(0);
    let initial=true,start=0,progress=1,frameId=0,lost=false;
    let pointer=[0,0],resizeTimer=0;
    const duration=1900;
    const smooth=(a,b,t)=>{const n=Math.min(1,Math.max(0,(t-a)/(b-a)));return n*n*(3-2*n);};
    const noise=n=>{const value=Math.sin(n*127.1+311.7)*43758.5453;return value-Math.floor(value);};
    function snapshot(){
      if(!data.length)return new Float32Array(0);
      const p=progress;
      const out=new Float32Array(count*8),exitAmount=initial?1:smooth(0,.43,p),enterAmount=smooth(initial?0:.34,1,p),c=smooth(.22,.83,p);
      for(let i=0;i<count;i++){
        const k=i*19,j=i*8;
        for(let axis=0;axis<3;axis++){
          const cloud=data[k+6+axis]+(axis<2?pointer[axis]*data[k+8]*.16:0);
          const flight=data[k+axis]+(cloud-data[k+axis])*exitAmount;
          out[j+axis]=flight+(data[k+3+axis]-flight)*enterAmount;
        }
        for(let channel=0;channel<4;channel++)out[j+3+channel]=data[k+9+channel]+(data[k+13+channel]-data[k+9+channel])*c;
        out[j+7]=data[k+17]+(data[k+18]-data[k+17])*enterAmount;
      }
      return out;
    }
    function install(page,animate=true,repeat=false){
      if(lost)return;
      const from=repeat?target.slice():snapshot();
      const originX=(width-page.width)/2,originY=(page.height-height)/2;
      for(let i=0;i<from.length;i+=8){from[i]+=originX;from[i+1]+=originY;}
      width=page.width;height=page.height;target=page.points;
      ratio=Math.min(devicePixelRatio||1,2);
      canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);gl.viewport(0,0,canvas.width,canvas.height);
      count=Math.max(from.length/8,target.length/8);
      data=new Float32Array(count*19);
      const fromCount=from.length/8,toCount=target.length/8;
      initial=fromCount===0;
      const spreadX=width*.6,spreadY=Math.min(height*.65,550),spreadZ=Math.max(400,Math.min(width,height)*.75);
      for(let i=0;i<count;i++){
        const k=i*19,fi=(i%Math.max(1,fromCount))*8,ti=(i%Math.max(1,toCount))*8;
        const cloud=[(noise(i*3+1)-.5)*spreadX*2,(noise(i*3+2)-.5)*spreadY*2,(noise(i*3+3)-.5)*spreadZ*2];
        for(let axis=0;axis<3;axis++){
          data[k+axis]=i<fromCount?from[fi+axis]:cloud[axis];
          data[k+3+axis]=i<toCount?target[ti+axis]:cloud[axis];
          data[k+6+axis]=cloud[axis];
        }
        for(let channel=0;channel<3;channel++){
          data[k+9+channel]=fromCount?from[fi+3+channel]:target[ti+3+channel];
          data[k+13+channel]=target[ti+3+channel];
        }
        data[k+12]=i<fromCount?from[fi+6]:0;
        data[k+16]=i<toCount?target[ti+6]:0;
        data[k+17]=i<fromCount?from[fi+7]:1;
        data[k+18]=i<toCount?target[ti+7]:1;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
      document.body.classList.remove('particle-unavailable');
      stage.classList.add('particle-ready');
      panels.forEach(panel=>panel.querySelectorAll('a').forEach(a=>{a.tabIndex=-1;}));
      stage.dataset.particleCount=String(toCount);
      start=performance.now();progress=animate&&!paused?0:1;
      stage.classList.toggle('is-assembling',progress<1);
      draw();schedule();
    }
    function draw(){
      if(lost)return;
      gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);
      gl.uniform2f(uniforms.uViewport,width,height);gl.uniform2f(uniforms.uPointer,pointer[0],pointer[1]);
      gl.uniform1f(uniforms.uCamera,Math.max(width,height)*1.5);
      gl.uniform1f(uniforms.uPixelRatio,ratio);gl.uniform1f(uniforms.uProgress,progress);gl.uniform1f(uniforms.uInitial,initial?1:0);
      gl.drawArrays(gl.POINTS,0,count);
      stage.dataset.phase=progress<1?'assembling':'formed';
    }
    function schedule(){if(!frameId&&!paused&&!document.hidden&&!lost&&progress<1)frameId=requestAnimationFrame(frame);}
    function frame(now){frameId=0;progress=Math.min(1,(now-start)/duration);draw();if(progress>=1)stage.classList.remove('is-assembling');else schedule();}
    function rebuild(animate=true){if(lost)return;try{install(composePage(),animate);}catch(error){fallback();}}
    function replay(){if(!paused&&!lost)install({width,height,points:target},true,true);}
    function setPaused(value){if(lost)return;cancelAnimationFrame(frameId);frameId=0;if(value){progress=1;stage.classList.remove('is-assembling');draw();}else replay();}
    function fallback(){lost=true;document.body.classList.add('particle-unavailable');replayButton.disabled=true;cancelAnimationFrame(frameId);frameId=0;stage.classList.remove('particle-ready','is-assembling');stage.style.height='';linkLayer.replaceChildren();panels.forEach(panel=>panel.querySelectorAll('a').forEach(a=>a.removeAttribute('tabindex')));}
    window.addEventListener('pointermove',event=>{const b=stage.getBoundingClientRect();pointer=[Math.max(-1,Math.min(1,(event.clientX-b.left)/b.width*2-1)),Math.max(-1,Math.min(1,1-(event.clientY-b.top)/b.height*2))];},{passive:true});
    window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>rebuild(false),130);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frameId);frameId=0;}else schedule();});
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;fallback();});
    canvas.addEventListener('webglcontextrestored',()=>location.reload());
    rebuild(true);
    return {rebuild,replay,setPaused};
  }
  const portrait=new Image();
  portrait.onload=()=>{
    try{
      const sample=document.createElement('canvas');sample.width=180;sample.height=240;
      const c=sample.getContext('2d',{willReadFrequently:true});c.drawImage(portrait,0,0,180,240);
      portraitPixels={rgba:c.getImageData(0,0,180,240).data,w:180,h:240};
      if(chapter===0)renderer?.rebuild(true);
    }catch(error){ /* The text experience remains usable without the portrait. */ }
  };
  portrait.src='assets/portrait-ink.png';
  const ready=document.fonts?.ready||Promise.resolve();
  ready.then(()=>{
    try{renderer=createRenderer();if(!renderer)document.body.classList.add('particle-unavailable');}
    catch(error){document.body.classList.add('particle-unavailable');stage.classList.remove('particle-ready');stage.style.height='';}
  });
})();
