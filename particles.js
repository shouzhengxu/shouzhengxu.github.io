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
  const hashes = ['portrait', 'path', 'papers', 'practice', 'honors', 'together'];
  const hashIndex = hash => hash === 'questions' ? 0 : hashes.indexOf(hash);
  const names = [['About','简介'], ['Education','教育经历'], ['Publications','学术论文'], ['Project','代表项目'], ['Honors','主要荣誉'], ['Activities','社团活动']];
  const colors = {ink:'#171d29',body:'#242a34',muted:'#4b5565',accent:'#24559a',rule:'#c0b9ac'};
  // 600 ms to release the letters, 600 ms for the image, 600 ms to reform.
  // Share these phases with the shader and snapshot to keep interrupted turns seamless.
  const motion = {duration:1800,stagger:.025,leaveEnd:1/3-.025,arriveStart:2/3,arriveStagger:.01};
  let chapter = Math.max(0, hashIndex(location.hash.slice(1)));
  let paused = reducedMotion.matches;
  let renderer = null;
  const imagePixels = new Map();
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
    const i = hashIndex(location.hash.slice(1));
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
    const turnDelay = paused || document.body.classList.contains('particle-unavailable') ? 550 : motion.duration + 120;
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

  // Glyphs and emblems share one sampled page. Link hit regions use the same
  // measured text runs, including links embedded in ordinary paragraphs.
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
    const contentWidth = Math.min(width - (narrow ? 10 : chapter === 1 ? 40 : 80), chapter === 1 ? 1080 : 840);
    const left = (width - contentWidth) / 2;
    const specs = {
      name:{size:narrow ? (width < 310 ? 39 : 44) : 61,line:1.2,after:9,color:'ink'},
      subtitle:{size:narrow ? 21 : 23,line:1.4,after:12,color:'muted'},
      motto:{size:narrow ? 22 : 24,line:1.5,after:27,color:'muted'},
      title:{size:narrow ? 39 : 54,line:1.23,after:narrow ? 29 : 38,color:'ink'},
      heading:{size:narrow ? 25 : 28,line:1.42,after:12,color:'ink'},
      body:{size:narrow ? 20 : 21,line:zh ? 1.8 : 1.55,after:22,color:'body'},
      faculty:{size:narrow ? 20 : 21,line:1.6,after:8,color:'body'},
      degree:{size:narrow ? 20 : 21,line:1.6,after:12,color:'body'},
      meta:{size:narrow ? 17 : 18,line:1.65,after:12,color:'muted'},
      note:{size:narrow ? 17 : 18,line:1.65,after:8,color:'muted'},
      authors:{size:narrow ? 17 : 18,line:1.65,after:13,color:'body'},
      paper:{size:narrow ? 24 : 28,line:1.42,after:13,color:'ink'},
      link:{size:narrow ? 18 : 20,line:1.6,after:18,color:'accent'}
    };
    const items = [], links = new Map();
    function runsOf(node, link=null, bold=false) {
      if(node.nodeType===Node.TEXT_NODE)return [{text:node.textContent,link,bold}];
      if(node.nodeType!==Node.ELEMENT_NODE || (node.dataset.lang && node.dataset.lang!==language()))return [];
      if(node.tagName==='BR')return [{text:'\n',link,bold}];
      return [...node.childNodes].flatMap(child=>runsOf(child,node.tagName==='A'?node:link,bold||node.tagName==='STRONG'));
    }
    function layoutText(element,box,record=true) {
      const type=element.dataset.particle, spec=specs[type];
      const weight=zh&&!['paper','authors'].includes(type)?'500':'400';
      const fontFor=run=>`${type==='motto'&&!zh?'italic ':''}${run.bold?'600':weight} ${spec.size}px ${['paper','authors'].includes(type)?latin:family}`;
      const tokens=[];
      for(const run of runsOf(element,element.tagName==='A'?element:null)) {
        for(const text of run.text.match(/\n|[^\S\n]+|[\u3400-\u9fff]|[^\s\u3400-\u9fff]+/gu)||[])tokens.push({...run,text:text==='\n'?'\n':/^\s+$/.test(text)?' ':text});
      }
      const lines=[];let line=[],lineWidth=0;
      function flush(){while(line.length&&line.at(-1).text===' '){lineWidth-=line.pop().width;}lines.push({runs:line,width:lineWidth});line=[];lineWidth=0;}
      function add(run){
        if(run.text==='\n'){flush();return;}
        if(!line.length&&run.text===' ')return;
        ctx.font=fontFor(run);
        const measured=ctx.measureText(run.text).width;
        if(measured>box.width){for(const ch of Array.from(run.text))add({...run,text:ch});return;}
        if(lineWidth+measured>box.width&&line.length){flush();if(run.text===' ')return;}
        line.push({...run,width:measured});lineWidth+=measured;
      }
      tokens.forEach(add);if(line.length)flush();
      const lineHeight=spec.size*spec.line;
      if(record)lines.forEach((line,index)=>{
        let x=box.x+(box.centered?(box.width-line.width)/2:0);
        const y=box.y+index*lineHeight;
        for(const run of line.runs){
          items.push({type:'text',text:run.text,x,y,font:fontFor(run),color:colors[run.link?'accent':spec.color]});
          if(run.link&&run.text.trim()){
            if(!links.has(run.link))links.set(run.link,[]);
            const boxes=links.get(run.link),last=boxes.at(-1);
            if(last&&last.y===y&&x-last.x-last.width<spec.size*.5)last.width=x+run.width-last.x;
            else boxes.push({x,y,width:run.width,height:lineHeight});
          }
          x+=run.width;
        }
      });
      return lines.length*lineHeight+spec.after;
    }
    function imageItem(element,x,y,w,h){items.push({type:'image',source:imagePixels.get(element.getAttribute('src')),x,y,width:w,height:h});}
    function block(element,y,box={x:left,width:contentWidth}) {
      if(element.dataset.particle==='rule'){items.push({type:'rule',x:box.x,y:y+3,width:box.width});return narrow?29:32;}
      if(element.dataset.particle==='portrait'){
        const h=narrow?146:142;
        const ratio=Number(element.getAttribute('width'))/Number(element.getAttribute('height'))||.75;
        imageItem(element,(width-h*ratio)/2,y,h*ratio,h);return h+18;
      }
      const centered=['name','subtitle','motto'].includes(element.dataset.particle);
      return layoutText(element,{...box,y,centered});
    }
    let cursor=0;
    if(chapter===1){
      cursor+=block(panels[chapter].querySelector('[data-particle="title"]'),cursor);
      const schools=[...panels[chapter].querySelectorAll('.school-entry')];
      if(width>=940){
        const gap=48, columnWidth=(contentWidth-gap)/2, emblemSize=76, inset=96;
        const cells=schools.map((school,i)=>{
          const x=left+i*(columnWidth+gap);
          imageItem(school.querySelector('img'),x,cursor+4,emblemSize,emblemSize);
          return {x:x+inset,width:columnWidth-inset,fields:[...school.querySelectorAll('[data-particle]:not(img)')]};
        });
        for(let row=0;row<cells[0].fields.length;row++){
          const rowHeight=Math.max(...cells.map(cell=>layoutText(cell.fields[row],{x:cell.x,width:cell.width,y:cursor},false)));
          for(const cell of cells)layoutText(cell.fields[row],{x:cell.x,width:cell.width,y:cursor});
          cursor+=rowHeight;
        }
      }else{
        schools.forEach((school,i)=>{
          const heading=school.querySelector('[data-particle="heading"]');
          const emblemSize=61;
          imageItem(school.querySelector('img'),left,cursor+3,emblemSize,emblemSize);
          cursor+=Math.max(emblemSize+15,layoutText(heading,{x:left+81,width:contentWidth-81,y:cursor}));
          for(const field of school.querySelectorAll('[data-particle]:not(img):not([data-particle="heading"])'))cursor+=block(field,cursor);
          if(i<schools.length-1){cursor+=13;items.push({type:'rule',x:left,y:cursor,width:contentWidth});cursor+=27;}
        });
      }
    }else{
      for(const element of panels[chapter].querySelectorAll('[data-particle]'))cursor+=block(element,cursor);
    }
    const padding=narrow?25:28;
    const height=Math.ceil(Math.max(minimumHeight,cursor+padding*2));
    const offset=Math.max(padding,(height-cursor)/2);
    stage.style.height=`${height}px`;
    if(Math.round(stage.getBoundingClientRect().width)!==width)return composePage();
    const sampling=Math.max(1,Math.min(devicePixelRatio||1,2));
    scratch.width=Math.ceil(width*sampling);scratch.height=Math.ceil(height*sampling);
    ctx.scale(sampling,sampling);ctx.textBaseline='top';
    for(const item of items){
      if(item.type==='text'){ctx.font=item.font;ctx.fillStyle=item.color;ctx.fillText(item.text,item.x,item.y+offset);}
      else if(item.type==='image'&&item.source)ctx.drawImage(item.source,item.x,item.y+offset,item.width,item.height);
      else if(item.type==='rule'){ctx.fillStyle=colors.rule;ctx.fillRect(item.x,item.y+offset,item.width,.7);}
    }
    const pixels=ctx.getImageData(0,0,scratch.width,scratch.height).data,points=[];
    for(let y=0;y<scratch.height;y++)for(let x=0;x<scratch.width;x++){
      const i=(y*scratch.width+x)*4,alpha=pixels[i+3]/255;
      if(!alpha)continue;
      points.push(stageRect.left+(x+.5)/sampling-viewportWidth/2,innerHeight/2-documentTop-(y+.5)/sampling,0,pixels[i]/255,pixels[i+1]/255,pixels[i+2]/255,alpha,1/sampling);
    }
    linkLayer.replaceChildren();
    for(const [element,boxes] of links){
      const minX=Math.min(...boxes.map(b=>b.x)),minY=Math.min(...boxes.map(b=>b.y));
      const maxX=Math.max(...boxes.map(b=>b.x+b.width)),maxY=Math.max(...boxes.map(b=>b.y+b.height));
      const a=document.createElement('a');a.className='particle-link';a.href=element.href;
      if(element.target){a.target=element.target;a.rel='noopener noreferrer';}
      a.style.cssText=`left:${minX}px;top:${minY+offset}px;width:${maxX-minX}px;height:${maxY-minY}px`;
      const text=selectedText(element).trim();a.setAttribute('aria-label',text);
      const label=document.createElement('span');label.className='sr-only';label.textContent=text;a.append(label);
      for(const box of boxes){const hit=document.createElement('span');hit.className='particle-link-hit';hit.setAttribute('aria-hidden','true');hit.style.cssText=`left:${box.x-minX}px;top:${box.y-minY}px;width:${box.width}px;height:${box.height}px`;a.append(hit);}
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
        float delay=seed*${motion.stagger.toFixed(6)};
        float leave=smoothstep(delay,${motion.leaveEnd.toFixed(6)}+delay,uProgress);
        float arrive=smoothstep(${motion.arriveStart.toFixed(6)}+seed*${motion.arriveStagger.toFixed(6)},1.0,uProgress);
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
    const duration=motion.duration;
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
      if(chapter===0 || chapter===2){
        const along=Math.floor(t*38)/38;
        const rib=noise(i*7+4);
        const spread=Math.pow(Math.sin(Math.PI*along),.7)*scale*.24;
        const shaft=noise(i*7+5)<.13;
        const reach=shaft?0:rib*spread*side;
        x=(along-.5)*scale*.66+reach*.86;
        y=(along-.5)*scale*1.05-reach*.5+Math.sin(rib*Math.PI)*spread*.17;
        z=reach*.19+Math.sin(along*Math.PI)*18;
      }else if(chapter===1 || chapter===3){
        const strand=Math.floor(v*5)-2;
        const breadth=Math.min(width*.86,1000);
        const bend=chapter===1 ? 1.1 : 1.8;
        x=(t-.5)*breadth;
        y=Math.sin((t-.5)*Math.PI*bend)*scale*.24+strand*8*Math.sin(t*Math.PI)+(t-.5)*scale*.26;
        z=Math.cos(t*Math.PI*2+strand*.6)*55;
      }else if(chapter===4){
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
        const delay=seed*motion.stagger;
        const leave=smooth(delay,motion.leaveEnd+delay,progress),arrive=smooth(motion.arriveStart+seed*motion.arriveStagger,1,progress),breath=leave*(1-arrive);
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
      stage.dataset.phase=progress<1?(progress>=motion.leaveEnd+motion.stagger&&progress<motion.arriveStart?'interlude':'assembling'):'formed';
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
  function prepareImage(element) {
    const source=element.getAttribute('src');
    return new Promise(resolve=>{
      const image=new Image();
      image.onload=()=>{
        try{
          const sample=document.createElement('canvas');
          const scale=Math.min(1,520/image.naturalHeight);
          sample.width=Math.round(image.naturalWidth*scale);sample.height=Math.round(image.naturalHeight*scale);
          const context=sample.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,sample.width,sample.height);
          if(['emblem','portrait'].includes(element.dataset.particle)){
            // Source artwork keeps its paper; only ink becomes moving particles.
            const pixels=context.getImageData(0,0,sample.width,sample.height),rgba=pixels.data;
            for(let i=0;i<rgba.length;i+=4){
              const opacity=1-Math.min(rgba[i],rgba[i+1],rgba[i+2])/255;
              if(opacity<.035){rgba[i+3]=0;continue;}
              for(let c=0;c<3;c++)rgba[i+c]=Math.max(0,Math.min(255,(rgba[i+c]-255*(1-opacity))/opacity));
              rgba[i+3]=Math.round(rgba[i+3]*opacity);
            }
            context.putImageData(pixels,0,0);
          }
          imagePixels.set(source,sample);
        }catch(error){ /* Text remains available if a source image cannot load. */ }
        resolve();
      };
      image.onerror=()=>resolve();image.src=source;
    });
  }
  const ready=Promise.all([document.fonts?.ready||Promise.resolve(),...[...document.querySelectorAll('[data-particle="portrait"], [data-particle="emblem"]')].map(prepareImage)]);
  ready.then(()=>{
    try{renderer=createRenderer();if(!renderer)document.body.classList.add('particle-unavailable');}
    catch(error){document.body.classList.add('particle-unavailable');document.body.classList.remove('has-particles');stage.classList.remove('particle-ready');stage.style.height='';}
  });
})();
