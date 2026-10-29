/* The page itself is a point cloud. Text is raster-sampled, then each sample
   becomes a WebGL point with its own trajectory through three-dimensional space. */
(() => {
  'use strict';
  const stage = document.getElementById('story');
  const canvas = document.getElementById('particle-canvas');
  const linkLayer = document.getElementById('particle-links');
  if (!stage || !canvas) return;
  const panels = [...document.querySelectorAll('[data-chapter]')];
  const previous = document.getElementById('previous-chapter');
  const next = document.getElementById('next-chapter');
  const motionButton = document.getElementById('motion-toggle');
  const replayButton = document.getElementById('replay-transition');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 700px)');
  const hashes = ['portrait', 'path', 'questions', 'papers', 'practice', 'together'];
  const names = [['Portrait','开篇'], ['Education','求学'], ['Research','探索'], ['Publications','论文'], ['Project','实践'], ['Together','同行']];
  const colors = {ink:'#171d29',body:'#242a34',muted:'#4b5565',accent:'#24559a',rule:'#c0b9ac'};
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
    const folio = document.getElementById('chapter-count');
    folio.textContent = `${['I','II','III','IV','V','VI'][chapter]} / VI`;
    folio.setAttribute('aria-label', zh ? `第 ${chapter + 1} 页，共 6 页` : `Page ${chapter + 1} of 6`);
    document.getElementById('chapter-announcement').textContent = `${chapter + 1} / 6 — ${names[chapter][zh ? 1 : 0]}`;
    motionButton.textContent = zh ? (paused ? '继续' : '暂停') : (paused ? 'Resume' : 'Pause');
    motionButton.setAttribute('aria-label', zh ? (paused ? '继续粒子动态' : '暂停粒子动态') : (paused ? 'Resume particle motion' : 'Pause particle motion'));
    motionButton.setAttribute('aria-pressed', String(paused));
    replayButton.textContent = zh ? '重读' : 'Replay';
    replayButton.disabled = paused;
    document.getElementById('navigation-instruction').textContent = mobile.matches ? (zh ? '左右轻扫，翻页' : 'Swipe to turn the page') : (zh ? '滚动，翻开下一页' : 'Scroll to turn the page');
    previous.disabled = chapter === 0;
    next.disabled = chapter === panels.length - 1;
  }
  function goTo(index, options = {}) {
    const target = Math.max(0, Math.min(panels.length - 1, index));
    if (target === chapter && !options.force) return;
    // Capture the old viewport before a long page is scrolled back to its top.
    const previousPage = renderer?.capture();
    if (options.scroll !== false && scrollY > 0) scrollTo({top:0,behavior:'instant'});
    chapter = target;
    navigationTime = performance.now();
    panels.forEach((panel, i) => { panel.hidden = i !== chapter; });
    updateControls();
    renderer?.rebuild(options.animate !== false, previousPage);
    if (!options.fromHistory) {
      const url = new URL(location.href); url.hash = hashes[chapter];
      history.replaceState(null, '', url);
    }
  }
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
    const turnDelay = paused || document.body.classList.contains('particle-unavailable') ? 550 : 4400;
    if (now - navigationTime < turnDelay || Math.abs(wheelSum) < 70) return;
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
    const viewportWidth = document.documentElement.clientWidth;
    const narrow = width < 650;
    const zh = language() === 'zh';
    const family = zh ? '"Songti SC", "STSong", serif' : 'Charter, "Bitstream Charter", Georgia, serif';
    const latin = 'Charter, "Bitstream Charter", Georgia, serif';
    const scratch = document.createElement('canvas');
    const ctx = scratch.getContext('2d', {willReadFrequently:true});
    const stageRect = stage.getBoundingClientRect();
    const documentTop = stageRect.top + scrollY;
    const minimumHeight = Math.max(350, innerHeight - documentTop - (narrow ? 90 : 100));
    const contentWidth = Math.min(width - (narrow ? 10 : 80), chapter === 0 ? 840 : 790);
    const left = (width - contentWidth) / 2;
    const centered = chapter === 0;
    const specs = {
      name: {size:narrow ? (width < 310 ? 40 : 45) : 65,line:1.2,after:9,color:'ink'},
      subtitle: {size:narrow ? 21 : 23,line:1.4,after:15,color:'muted'},
      motto: {size:narrow ? 22 : 25,line:1.5,after:24,color:'muted'},
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
        const imageHeight = narrow ? 154 : Math.min(190, Math.max(144, minimumHeight * .25));
        items.push({type,x:(width-imageHeight*.75)/2,y:cursor,width:imageHeight*.75,height:imageHeight});
        cursor += imageHeight + 22; continue;
      }
      if (type === 'rule') { items.push({type,x:left,y:cursor+3,width:contentWidth}); cursor += narrow ? 26 : 27; continue; }
      const spec = specs[type];
      const text = selectedText(element).trim();
      const weight = zh && !['paper','authors'].includes(type) ? '500' : '400';
      const font = `${type === 'motto' && !zh ? 'italic ' : ''}${weight} ${spec.size}px ${['paper','authors'].includes(type) ? latin : family}`;
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
    // A classic scrollbar can change the column width after its height grows.
    if (Math.round(stage.getBoundingClientRect().width) !== width) return composePage();
    const sampling = Math.max(1, Math.min(devicePixelRatio || 1, 2));
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
      if (alpha === 0) continue;
      points.push(stageRect.left+(x+.5)/sampling-viewportWidth/2, innerHeight/2-documentTop-(y+.5)/sampling, 0, pixels[i]/255,pixels[i+1]/255,pixels[i+2]/255,alpha,1/sampling);
    }
    if (portraitBox && portraitPixels) {
      const {rgba,w,h}=portraitPixels;
      for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
        const i=(y*w+x)*4;
        const alpha=rgba[i+3]/255;
        const darkness=(1-(rgba[i]*.2126+rgba[i+1]*.7152+rgba[i+2]*.0722)/255)*alpha;
        if(darkness<.10 || (x*13+y*7)%19/19 > Math.pow(darkness,.6))continue;
        points.push(stageRect.left+portraitBox.x+x/w*portraitBox.width-viewportWidth/2,innerHeight/2-documentTop-(portraitBox.y+y/h*portraitBox.height),0,rgba[i]/255,rgba[i+1]/255,rgba[i+2]/255,Math.min(1,.25+darkness)*alpha,1.2);
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
    return {width:viewportWidth,height:innerHeight,points:new Float32Array(points)};
  }

  function createRenderer() {
    const gl=canvas.getContext('webgl',{alpha:true,antialias:false,depth:false,powerPreference:'low-power'});
    if(!gl)return null;
    // The settled page lives in document coordinates. The feather and streams
    // live in viewport coordinates, so their motion is free of the text column.
    const vertex=`
      attribute vec3 aFrom;
      attribute vec3 aTo;
      attribute vec3 aSymbol;
      attribute vec3 aGuide;
      attribute vec4 aFromColor;
      attribute vec4 aToColor;
      attribute vec4 aTraits;
      uniform vec2 uViewport;
      uniform vec2 uPointer;
      uniform float uCamera;
      uniform float uPixelRatio;
      uniform float uProgress;
      uniform float uScroll;
      uniform float uInkFraction;
      varying vec4 vColor;
      varying float vRound;
      vec3 curve(vec3 a,vec3 b,vec3 c,float t){return a*(1.0-t)*(1.0-t)+2.0*b*t*(1.0-t)+c*t*t;}
      void main(){
        float seed=aTraits.z;
        float delay=seed*.075;
        float leave=smoothstep(.02+delay,.31+delay,uProgress);
        float arrive=smoothstep(.66+delay*.4,1.0,uProgress);
        float breath=leave*(1.0-arrive);
        float phase=aTraits.w*6.2831853;
        vec3 symbol=aSymbol;
        // A slow travelling ripple runs along each coherent ink stroke.
        symbol.x+=sin(phase+uProgress*5.0)*8.0;
        symbol.y+=sin(phase*.7+uProgress*4.3)*7.0;
        symbol.z+=sin(phase+uProgress*3.0)*15.0;
        symbol.y-=uScroll;
        vec3 guide=aGuide;guide.y-=uScroll;
        vec3 gather=vec3(-aGuide.x*.7,aGuide.y*.65-uScroll,aGuide.z*.7);
        vec3 p=curve(curve(aFrom,guide,symbol,leave),gather,aTo,arrive);
        p.xy+=uPointer*p.z*.045*breath;
        p.y+=uScroll;
        float depth=max(.55,1.0-p.z/uCamera);
        gl_Position=vec4(p.x*2.0/uViewport.x,p.y*2.0/uViewport.y,0.0,depth);
        float size=mix(aTraits.x,aTraits.y,arrive);
        float stillRound=step(1.01,size);
        size=mix(size,max(1.1,size),breath);
        gl_PointSize=max(1.0,size*uPixelRatio/depth);
        vRound=max(breath,stillRound);
        vec4 color=mix(aFromColor,aToColor,arrive);
        vec3 ink=mix(vec3(.17,.25,.34),vec3(.46,.34,.18),step(.94,aTraits.w));
        color.rgb=mix(color.rgb,ink,breath*.8);
        // Only a small selection writes the interlude. The rest return as text.
        float inkAlpha=seed<uInkFraction ? .38 : 0.0;
        color.a=mix(color.a,inkAlpha,breath);
        vColor=color;
      }
    `;
    const fragment=`
      precision mediump float;
      varying vec4 vColor;
      varying float vRound;
      void main(){
        float radius=length(gl_PointCoord-vec2(.5));
        float disc=1.0-smoothstep(.32,.5,radius);
        // One square point per sampled screen pixel reproduces the original
        // font exactly at rest, including its anti-aliased edge opacity.
        float coverage=mix(1.0,disc,vRound);
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
    const stride=24;
    const attributes=[['aFrom',3,0],['aTo',3,3],['aSymbol',3,6],['aGuide',3,9],['aFromColor',4,12],['aToColor',4,16],['aTraits',4,20]];
    for(const [name,size,offset] of attributes){const a=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,stride*4,offset*4);}
    const uniforms={};for(const key of ['uViewport','uPointer','uCamera','uPixelRatio','uProgress','uScroll','uInkFraction'])uniforms[key]=gl.getUniformLocation(program,key);
    let width=1,height=1,ratio=1,count=0,data=new Float32Array(0),target=new Float32Array(0);
    let start=0,progress=1,frameId=0,scrollFrame=0,lost=false;
    let pointer=[0,0],resizeTimer=0,inkFraction=.12;
    const duration=4200;
    const smooth=(a,b,t)=>{const n=Math.min(1,Math.max(0,(t-a)/(b-a)));return n*n*(3-2*n);};
    const noise=n=>{const value=Math.sin(n*127.1+311.7)*43758.5453;return value-Math.floor(value);};
    const lerp=(a,b,t)=>a+(b-a)*t;
    const curve=(a,b,c,t)=>a*(1-t)*(1-t)+2*b*t*(1-t)+c*t*t;

    // These are strokes, rather than filled surfaces: a quill for writing,
    // rising streams for learning and practice, branches and orbits for ideas.
    function symbolicPoint(i){
      const t=noise(i*7+1),v=noise(i*7+2),side=v<.5?-1:1;
      const scale=Math.min(width*.72,height*.65,510);
      const jitter=(noise(i*7+3)-.5)*2.5;
      let x,y,z;
      if(chapter===0 || chapter===3){
        const along=Math.floor(t*38)/38;
        const rib=noise(i*7+4);
        const spread=Math.pow(Math.sin(Math.PI*along),.7)*scale*.24;
        const shaft=noise(i*7+5)<.13;
        const reach=shaft?0:rib*spread*side;
        x=(along-.5)*scale*.66+reach*.86;
        y=(along-.5)*scale*1.05-reach*.5+Math.sin(rib*Math.PI)*spread*.17;
        z=reach*.19+Math.sin(along*Math.PI)*18;
      }else if(chapter===1 || chapter===4){
        const strand=Math.floor(v*5)-2;
        const breadth=Math.min(width*.86,1000);
        const bend=chapter===1 ? 1.1 : 1.8;
        x=(t-.5)*breadth;
        y=Math.sin((t-.5)*Math.PI*bend)*scale*.24+strand*8*Math.sin(t*Math.PI)+(t-.5)*scale*.26;
        z=Math.cos(t*Math.PI*2+strand*.6)*55;
      }else if(chapter===2){
        const branch=Math.floor(v*9);
        const side=branch%2?1:-1;
        const root=branch/9;
        const reach=t*Math.sin(root*Math.PI)*scale*.44;
        x=side*reach+Math.sin(root*3)*scale*.08;
        y=(root-.5)*scale*.82+t*scale*.25-Math.sin(t*Math.PI)*scale*.1;
        z=Math.sin(t*Math.PI+branch)*34;
      }else{
        const strand=Math.floor(v*3),angle=t*Math.PI*2;
        x=Math.sin(angle)*scale*.57;
        y=Math.sin(angle*2)*scale*.21+(strand-1)*9;
        z=Math.cos(angle+strand*.35)*60;
      }
      return [x+jitter,y+jitter*.6,z];
    }

    // Snapshot uses the shader's exact choreography, including alpha and depth.
    // It can therefore become the source of a new turn without a visible jump.
    function snapshot(){
      if(!data.length)return new Float32Array(0);
      const out=new Float32Array(count*8);
      for(let i=0;i<count;i++){
        const k=i*stride,j=i*8,seed=data[k+22],phase=data[k+23]*Math.PI*2;
        const leave=smooth(.02+seed*.075,.31+seed*.075,progress),arrive=smooth(.66+seed*.03,1,progress),breath=leave*(1-arrive);
        const symbol=[data[k+6]+Math.sin(phase+progress*5)*8,data[k+7]+Math.sin(phase*.7+progress*4.3)*7-scrollY,data[k+8]+Math.sin(phase+progress*3)*15];
        const guide=[data[k+9],data[k+10]-scrollY,data[k+11]];
        const gather=[-data[k+9]*.7,data[k+10]*.65-scrollY,data[k+11]*.7];
        for(let axis=0;axis<3;axis++)out[j+axis]=curve(curve(data[k+axis],guide[axis],symbol[axis],leave),gather[axis],data[k+3+axis],arrive);
        for(let axis=0;axis<2;axis++)out[j+axis]+=pointer[axis]*out[j+2]*.045*breath;
        const ink=data[k+23]>=.94?[.46,.34,.18]:[.17,.25,.34];
        for(let channel=0;channel<3;channel++)out[j+3+channel]=lerp(lerp(data[k+12+channel],data[k+16+channel],arrive),ink[channel],breath*.8);
        out[j+6]=lerp(lerp(data[k+15],data[k+19],arrive),seed<inkFraction?.38:0,breath);
        const size=lerp(data[k+20],data[k+21],arrive);
        out[j+7]=lerp(size,Math.max(1.1,size),breath);
      }
      return out;
    }
    function capture(){
      const from=snapshot();
      for(let j=0;j<from.length;j+=8)from[j+1]+=scrollY;
      return from;
    }
    function install(page,animate=true,fromOverride=null){
      if(lost)return;
      cancelAnimationFrame(frameId);frameId=0;
      const from=fromOverride||snapshot();
      width=page.width;height=page.height;target=page.points;
      ratio=Math.max(1,Math.min(devicePixelRatio||1,2));
      canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);gl.viewport(0,0,canvas.width,canvas.height);
      count=Math.max(from.length/8,target.length/8);
      inkFraction=Math.min(.4,Math.max(.10,8000/Math.max(1,count)));
      data=new Float32Array(count*stride);
      const fromCount=from.length/8,toCount=target.length/8;
      for(let i=0;i<count;i++){
        const k=i*stride,fi=(i%Math.max(1,fromCount))*8,ti=(i%Math.max(1,toCount))*8;
        const symbol=symbolicPoint(i),phase=noise(i*7+1);
        const guide=[symbol[0]*.35+Math.cos(phase*Math.PI*2)*width*.45,symbol[1]*.4+Math.sin(phase*Math.PI*2)*height*.38,80+phase*130];
        for(let axis=0;axis<3;axis++){
          data[k+axis]=i<fromCount?from[fi+axis]:symbol[axis]-(axis===1?scrollY:0);
          data[k+3+axis]=i<toCount?target[ti+axis]:symbol[axis]-(axis===1?scrollY:0);
          data[k+6+axis]=symbol[axis];data[k+9+axis]=guide[axis];
        }
        for(let channel=0;channel<3;channel++){
          data[k+12+channel]=fromCount?from[fi+3+channel]:target[ti+3+channel];
          data[k+16+channel]=target[ti+3+channel];
        }
        data[k+15]=i<fromCount?from[fi+6]:0;data[k+19]=i<toCount?target[ti+6]:0;
        data[k+20]=i<fromCount?from[fi+7]:.9;data[k+21]=i<toCount?target[ti+7]:.9;
        data[k+22]=noise(i*19+7);data[k+23]=phase;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
      document.body.classList.remove('particle-unavailable');document.body.classList.add('has-particles');
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
      gl.uniform1f(uniforms.uPixelRatio,ratio);gl.uniform1f(uniforms.uProgress,progress);gl.uniform1f(uniforms.uScroll,scrollY);gl.uniform1f(uniforms.uInkFraction,inkFraction);
      gl.drawArrays(gl.POINTS,0,count);
      stage.dataset.phase=progress<1?(progress>.36&&progress<.66?'interlude':'assembling'):'formed';
    }
    function schedule(){if(!frameId&&!paused&&!document.hidden&&!lost&&progress<1)frameId=requestAnimationFrame(frame);}
    function frame(now){frameId=0;progress=Math.min(1,(now-start)/duration);draw();if(progress>=1)stage.classList.remove('is-assembling');else schedule();}
    function rebuild(animate=true,from=null){
      if(lost)return;
      try{
        const source=from||snapshot(),oldScroll=scrollY;
        const page=composePage();
        // A shorter translation may clamp native scroll while it is laid out.
        if(!from)for(let j=0;j<source.length;j+=8)source[j+1]+=oldScroll-scrollY;
        install(page,animate,source);
      }catch(error){fallback();}
    }
    function replay(){if(!paused&&!lost)rebuild(true);}
    function setPaused(value){if(lost)return;cancelAnimationFrame(frameId);frameId=0;if(value){progress=1;stage.classList.remove('is-assembling');draw();}else replay();}
    function fallback(){
      lost=true;document.body.classList.add('particle-unavailable');document.body.classList.remove('has-particles');
      replayButton.disabled=true;cancelAnimationFrame(frameId);cancelAnimationFrame(scrollFrame);frameId=0;
      stage.classList.remove('particle-ready','is-assembling');stage.style.height='';linkLayer.replaceChildren();
      panels.forEach(panel=>panel.querySelectorAll('a').forEach(a=>a.removeAttribute('tabindex')));
    }
    window.addEventListener('pointermove',event=>{pointer=[Math.max(-1,Math.min(1,event.clientX/document.documentElement.clientWidth*2-1)),Math.max(-1,Math.min(1,1-event.clientY/innerHeight*2))];},{passive:true});
    window.addEventListener('scroll',()=>{
      if(frameId||scrollFrame||lost)return;
      scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;draw();});
    },{passive:true});
    window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{updateControls();rebuild(false);},130);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frameId);frameId=0;}else schedule();});
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fallback();});
    canvas.addEventListener('webglcontextrestored',()=>location.reload());
    rebuild(true);
    return {rebuild,replay,setPaused,capture};
  }
  const portrait=new Image();
  portrait.onload=()=>{
    try{
      const sample=document.createElement('canvas');sample.width=180;sample.height=240;
      const c=sample.getContext('2d',{willReadFrequently:true});c.drawImage(portrait,0,0,180,240);
      portraitPixels={rgba:c.getImageData(0,0,180,240).data,w:180,h:240};
      if(chapter===0)renderer?.rebuild(stage.dataset.phase !== 'formed');
    }catch(error){ /* The text experience remains usable without the portrait. */ }
  };
  portrait.src='assets/portrait-ink-transparent.png';
  const ready=document.fonts?.ready||Promise.resolve();
  ready.then(()=>{
    try{renderer=createRenderer();if(!renderer)document.body.classList.add('particle-unavailable');}
    catch(error){document.body.classList.add('particle-unavailable');document.body.classList.remove('has-particles');stage.classList.remove('particle-ready');stage.style.height='';}
  });
})();
