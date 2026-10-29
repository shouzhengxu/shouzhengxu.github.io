/* A small, dependency-free WebGL point field. The portrait is sampled from
   the existing drawing; its paper remains empty space rather than a plane. */
(() => {
  'use strict';
  const canvas = document.getElementById('particle-canvas');
  const scene = document.getElementById('particle-scene');
  if (!canvas || !scene) return;
  const panels = Array.from(document.querySelectorAll('[data-chapter]'));
  const chapterButtons = Array.from(document.querySelectorAll('[data-go]'));
  const previous = document.getElementById('previous-chapter');
  const next = document.getElementById('next-chapter');
  const motionButton = document.getElementById('motion-toggle');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = window.matchMedia('(max-width: 800px)');
  const captions = [
    ['A portrait, held in light', '以微光，勾勒轮廓'],
    ['Two paths, one unfolding journey', '两段旅程，一路求索'],
    ['Knowledge becomes a constellation', '让知识，彼此联结'],
    ['A page opens into space', '纸页展开，思想生长'],
    ['Many sources, a shared understanding', '万千线索，汇成理解'],
    ['Every connection begins somewhere', '每一次联结，皆有起点']
  ];
  const chapterNames = [['Portrait','开篇'],['Education','求学'],['Research','探索'],['Publications','论文'],['Project','实践'],['Together','同行']];
  const hashes = ['portrait','path','questions','papers','practice','together'];
  let chapter = 0;
  let paused = reducedMotion.matches;
  let renderer = null;
  let wheelSum = 0;
  let wheelTime = 0;
  let lastNavigation = -Infinity;
  const getLanguage = () => document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';

  function updateLanguage() {
    const zh = getLanguage() === 'zh';
    document.title = zh ? '光之篇 · 徐守正' : 'In Light · Shouzheng Xu';
    document.getElementById('form-caption').textContent = captions[chapter][zh ? 1 : 0];
    document.getElementById('chapter-announcement').textContent = `${chapter + 1} / 6 — ${chapterNames[chapter][zh ? 1 : 0]}`;
    motionButton.textContent = zh ? (paused ? '继续动态' : '暂停动态') : (paused ? 'Resume motion' : 'Pause motion');
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.setAttribute('aria-label', zh ? (paused ? '继续粒子动态' : '暂停粒子动态') : (paused ? 'Resume particle motion' : 'Pause particle motion'));
    document.querySelector('.navigation-hint').innerHTML = zh ? '滚动探索 <span aria-hidden="true">↓</span>' : 'Scroll to explore <span aria-hidden="true">↓</span>';
    document.getElementById('explore-instruction-en').textContent = mobile.matches ? 'Swipe sideways or choose a chapter below.' : 'Scroll to follow the thread.';
    document.getElementById('explore-instruction-zh').textContent = mobile.matches ? '左右轻扫，或点选下方章节。' : '向下滚动，继续阅读。';
  }

  function goTo(index, options = {}) {
    const target = Math.max(0, Math.min(panels.length - 1, index));
    if (target === chapter && !options.force) return;
    chapter = target;
    panels.forEach((panel, i) => {
      const active = i === chapter;
      panel.hidden = !active;
      panel.classList.toggle('active', active);
    });
    chapterButtons.forEach((button, i) => {
      if (i === chapter) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    previous.disabled = chapter === 0;
    next.disabled = chapter === panels.length - 1;
    document.getElementById('chapter-count').textContent = `${String(chapter + 1).padStart(2, '0')} / 06`;
    updateLanguage();
    renderer?.setChapter(chapter);
    if (!options.fromHistory) {
      const url = new URL(window.location.href);
      url.hash = hashes[chapter];
      history.replaceState(null, '', url);
    }
    if (options.scroll !== false && (mobile.matches || window.scrollY > 1)) window.scrollTo({top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth'});
  }

  chapterButtons.forEach(button => button.addEventListener('click', () => goTo(Number(button.dataset.go))));
  previous.addEventListener('click', () => goTo(chapter - 1));
  next.addEventListener('click', () => goTo(chapter + 1));
  motionButton.addEventListener('click', () => {
    paused = !paused;
    renderer?.setPaused(paused);
    updateLanguage();
  });
  reducedMotion.addEventListener('change', event => {
    paused = event.matches;
    renderer?.setPaused(paused);
    updateLanguage();
  });
  document.addEventListener('languagechange', updateLanguage);
  mobile.addEventListener('change', updateLanguage);
  window.addEventListener('hashchange', () => {
    const index = hashes.indexOf(location.hash.slice(1));
    if (index >= 0) goTo(index, {fromHistory: true});
  });
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault(); goTo(chapter + (event.key === 'ArrowRight' ? 1 : -1));
    } else if (['ArrowDown', 'PageDown', 'ArrowUp', 'PageUp'].includes(event.key)) {
      const direction = event.key === 'ArrowDown' || event.key === 'PageDown' ? 1 : -1;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll > 8) {
        const atBoundary = direction > 0 ? window.scrollY >= maxScroll - 3 : window.scrollY <= 3;
        if (!atBoundary || (direction < 0 && chapter === 0) || (direction > 0 && chapter === panels.length - 1)) return;
      }
      event.preventDefault(); goTo(chapter + direction);
    } else if (event.key === 'Home') {event.preventDefault(); goTo(0);}
    else if (event.key === 'End') {event.preventDefault(); goTo(panels.length - 1);}
  });
  window.addEventListener('wheel', event => {
    if (mobile.matches || event.ctrlKey || window.innerHeight < 610) return;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if (maxScroll > 8) {
      const atBoundary = event.deltaY > 0 ? window.scrollY >= maxScroll - 3 : window.scrollY <= 3;
      if (!atBoundary || (event.deltaY < 0 && chapter === 0) || (event.deltaY > 0 && chapter === panels.length - 1)) {wheelSum = 0; return;}
    }
    const now = performance.now();
    if (now - wheelTime > 180) wheelSum = 0;
    wheelTime = now;
    wheelSum += event.deltaY * (event.deltaMode === 1 ? 16 : 1);
    if (Math.abs(event.deltaY) > 2) event.preventDefault();
    if (now - lastNavigation < 1150 || Math.abs(wheelSum) < 65) return;
    goTo(chapter + Math.sign(wheelSum));
    lastNavigation = now; wheelSum = 0;
  }, {passive: false});
  let touchX = 0, touchY = 0;
  document.getElementById('story').addEventListener('touchstart', event => {
    touchX = event.touches[0].clientX; touchY = event.touches[0].clientY;
  }, {passive: true});
  document.getElementById('story').addEventListener('touchend', event => {
    const dx = event.changedTouches[0].clientX - touchX;
    const dy = event.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.3) goTo(chapter + (dx < 0 ? 1 : -1));
  }, {passive: true});
  const initialChapter = hashes.indexOf(location.hash.slice(1));
  goTo(initialChapter < 0 ? 0 : initialChapter, {force: true, fromHistory: true, scroll: false});

  function createRenderer() {
    const gl = canvas.getContext('webgl', {alpha: true, antialias: false, depth: false, powerPreference: 'low-power'});
    if (!gl) return null;
    const vertex = `
      attribute vec3 aPosition;
      attribute vec3 aColor;
      attribute float aSize;
      uniform float uAspect;
      uniform float uYaw;
      uniform float uPitch;
      uniform float uPixelRatio;
      uniform float uPointScale;
      uniform float uModelScale;
      uniform float uTime;
      uniform float uMovement;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec3 p = aPosition * uModelScale;
        float sway = sin(uTime * .24 + p.y * .55 + p.x * .31) * .018 * uMovement;
        p.x += sway;
        float cy = cos(uYaw), sy = sin(uYaw), cp = cos(uPitch), sp = sin(uPitch);
        p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
        p = vec3(p.x, cp * p.y - sp * p.z, sp * p.y + cp * p.z);
        float depth = 7.8 - p.z;
        gl_Position = vec4(p.x * 2.41421356 / uAspect, p.y * 2.41421356, depth - .2, depth);
        gl_PointSize = clamp(aSize * uPixelRatio * uPointScale * (7.8 / depth), 1.0, 5.5 * uPixelRatio);
        vColor = aColor;
        vAlpha = clamp(1.0 - abs(p.z) * .045, .55, 1.0);
      }
    `;
    const fragment = `
      precision mediump float;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - vec2(.5));
        if (d > .5) discard;
        float core = 1.0 - smoothstep(.12, .5, d);
        gl_FragColor = vec4(vColor, core * vAlpha * .82);
      }
    `;
    function compile(source, type) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {gl.deleteShader(shader); throw new Error('Particle shader unavailable');}
      return shader;
    }
    const program = gl.createProgram();
    const vert = compile(vertex, gl.VERTEX_SHADER), frag = compile(fragment, gl.FRAGMENT_SHADER);
    gl.attachShader(program, vert); gl.attachShader(program, frag); gl.linkProgram(program);
    gl.deleteShader(vert); gl.deleteShader(frag);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Particle renderer unavailable');
    gl.useProgram(program);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.clearColor(0, 0, 0, 0);
    const count = mobile.matches ? 11500 : 22000;
    const dustCount = mobile.matches ? 200 : 420;
    const total = count + dustCount;
    const positions = new Float32Array(total * 3);
    const colors = new Float32Array(total * 3);
    const sizes = new Float32Array(total);
    const from = new Float32Array(count * 3);
    const forms = [];
    let seed = 817;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const rand = (a, b) => a + (b - a) * random();
    const pi2 = Math.PI * 2;
    for (let i = 0; i < total; i++) {
      const gold = random() > .975;
      const bright = rand(.66, 1);
      colors[i * 3] = (gold ? .96 : .57) * bright;
      colors[i * 3 + 1] = (gold ? .77 : .79) * bright;
      colors[i * 3 + 2] = (gold ? .43 : .96) * bright;
      sizes[i] = rand(.7, 1.6);
      if (i >= count) {
        positions[i * 3] = rand(-5.5, 5.5);
        positions[i * 3 + 1] = rand(-4, 4);
        positions[i * 3 + 2] = rand(-5, 1);
        sizes[i] = rand(.45, 1.3);
        colors[i * 3] *= .32; colors[i * 3 + 1] *= .32; colors[i * 3 + 2] *= .32;
      }
    }
    function makeForm(pointAt) {
      const points = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const p = pointAt(i, i / count);
        points[i * 3] = p[0]; points[i * 3 + 1] = p[1]; points[i * 3 + 2] = p[2];
      }
      return points;
    }
    // A pair of ascending ribbons: distinct journeys with a common direction.
    forms[1] = makeForm((i, t) => {
      const strand = i % 2;
      const u = random();
      const angle = u * Math.PI * 2.05 + strand * Math.PI;
      const ribbon = rand(-.14, .14);
      return [Math.cos(angle) * (1.58 + ribbon), (u - .5) * 5.6, Math.sin(angle) * 1.15 + ribbon];
    });
    // Knowledge as connected nodes, drawn in three dimensions.
    const nodes = [];
    for (let i = 0; i < 26; i++) {
      const y = 1 - (i / 25) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = i * Math.PI * (3 - Math.sqrt(5));
      nodes.push([Math.cos(theta) * r * 2.45, y * 2.45, Math.sin(theta) * r * 2.45]);
    }
    const edges = [];
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]) < 2.05) edges.push([a,b]);
    }
    forms[2] = makeForm((i) => {
      if (i % 4 === 0) {
        const p = nodes[i % nodes.length], a = rand(0, pi2), b = rand(0, Math.PI), r = rand(.01,.12);
        return [p[0]+Math.sin(b)*Math.cos(a)*r,p[1]+Math.sin(b)*Math.sin(a)*r,p[2]+Math.cos(b)*r];
      }
      const edge = edges[i % edges.length], t = random(), spread = .018;
      return edge[0].map((v, k) => v + (edge[1][k] - v) * t + rand(-spread, spread));
    });
    // Layers of an open book. The margins and lines are built from points.
    forms[3] = makeForm((i) => {
      const side = i % 2 ? 1 : -1;
      let u = random(), v = rand(-1,1);
      const layer = Math.floor(random() * 4);
      if (i % 4 === 0) u = i % 8 === 0 ? 0 : 1;
      else if (i % 5 === 0) v = i % 10 === 0 ? -1 : 1;
      else if (i % 3 !== 0) v = Math.round(v * 13) / 13;
      const x = side * (.035 + u * 2.35);
      const y = v * 1.85 + Math.sin(u * Math.PI) * .16;
      const z = -Math.sin(u * Math.PI * .72) * .68 + layer * .09;
      return [x, y, z];
    });
    // A stream of evidence converges on a central line and opens outward.
    forms[4] = makeForm((i) => {
      const band = i % 9;
      const t = random();
      const x = (t - .5) * 5.8;
      const spread = Math.pow(Math.abs(t - .5) * 2, 1.3);
      const angle = band * pi2 / 9 + t * 1.4;
      const radius = .12 + spread * 1.8;
      return [x, Math.cos(angle) * radius + rand(-.028,.028), Math.sin(angle) * radius + rand(-.028,.028)];
    });
    // A fine orbital weave, suggesting the connections in a community.
    forms[5] = makeForm((i) => {
      const ring = i % 7;
      const t = rand(0, pi2);
      const tilt = ring * Math.PI / 7;
      const radius = 2.3 + rand(-.035,.035);
      const x = Math.cos(t) * radius, y = Math.sin(t) * radius;
      return [x * Math.cos(tilt), y, x * Math.sin(tilt)];
    });
    // A quiet placeholder is visible only while the source portrait decodes.
    forms[0] = makeForm((i,t) => {
      const a = t * pi2 * 19, r = Math.sqrt(t) * 2;
      return [Math.cos(a) * r, Math.sin(a) * r, rand(-.05,.05)];
    });
    positions.set(forms[chapter], 0);
    from.set(forms[chapter]);
    const positionBuffer = gl.createBuffer();
    function bindAttribute(name, data, size, usage, buffer) {
      const b = buffer || gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,b); gl.bufferData(gl.ARRAY_BUFFER,data,usage);
      const location = gl.getAttribLocation(program,name);
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);
      return b;
    }
    bindAttribute('aPosition', positions, 3, gl.DYNAMIC_DRAW, positionBuffer);
    bindAttribute('aColor', colors, 3, gl.STATIC_DRAW);
    bindAttribute('aSize', sizes, 1, gl.STATIC_DRAW);
    const uniforms = {};
    ['uAspect','uYaw','uPitch','uPixelRatio','uPointScale','uModelScale','uTime','uMovement'].forEach(name => uniforms[name]=gl.getUniformLocation(program,name));
    let width = 1, height = 1, ratio = 1;
    let currentChapter = chapter;
    let transitionStart = -Infinity;
    let isPaused = paused;
    let animationId = 0;
    let lastFrame = 0;
    let time = 0;
    let pointerX = 0, pointerY = 0, yaw = 0, pitch = 0;
    let modelScale = 1;
    let portraitReady = false;
    let contextLost = false;
    let sceneVisible = true;

    function resize() {
      const bounds = scene.getBoundingClientRect();
      width = bounds.width; height = bounds.height;
      ratio = Math.min(window.devicePixelRatio || 1, mobile.matches ? 1.7 : 2);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      gl.viewport(0,0,canvas.width,canvas.height);
      draw(performance.now(), true);
    }
    function setChapter(index) {
      from.set(positions.subarray(0,count * 3));
      currentChapter = index;
      transitionStart = performance.now();
      if (isPaused || reducedMotion.matches) {
        positions.set(forms[index]); transitionStart = -Infinity;
        draw(performance.now(),true);
      } else ensureFrame();
    }
    function setPaused(value) {
      isPaused = value;
      if (value) {
        cancelAnimationFrame(animationId); animationId = 0;
        positions.set(forms[currentChapter]); transitionStart = -Infinity;
        draw(performance.now(),true);
      } else {lastFrame = 0; ensureFrame();}
    }
    function ensureFrame() {
      if (!animationId && !isPaused && !document.hidden && sceneVisible && !contextLost) animationId = requestAnimationFrame(frame);
    }
    function frame(now) {
      animationId = 0;
      if (isPaused || document.hidden || !sceneVisible || contextLost) return;
      if (!lastFrame || now - lastFrame >= 1000 / (mobile.matches ? 30 : 45)) {
        const dt = lastFrame ? Math.min((now - lastFrame)/1000,.1) : .016;
        time += dt; lastFrame = now;
        draw(now, false);
      }
      ensureFrame();
    }
    function draw(now, force) {
      if (contextLost || !width || !height) return;
      const elapsed = (now - transitionStart) / 1650;
      if (elapsed < 1) {
        const t = Math.min(1,Math.max(0,elapsed));
        const smooth = t*t*(3-2*t);
        const bloom = Math.sin(t * Math.PI) * .28;
        const target = forms[currentChapter];
        for(let i=0;i<count;i++) {
          const k=i*3;
          positions[k] = from[k]+(target[k]-from[k])*smooth + Math.sin(i*1.618)*bloom;
          positions[k+1] = from[k+1]+(target[k+1]-from[k+1])*smooth + Math.cos(i*2.13)*bloom;
          positions[k+2] = from[k+2]+(target[k+2]-from[k+2])*smooth + Math.sin(i*.79)*bloom*2;
        }
      } else if (transitionStart !== -Infinity) {
        positions.set(forms[currentChapter]); transitionStart = -Infinity;
      }
      const portrait = currentChapter === 0;
      const targetYaw = isPaused ? (portrait ? 0 : .12) : Math.sin(time*.13)*(portrait?.045:.22)+pointerX*(portrait?.07:.17);
      const targetPitch = isPaused ? 0 : Math.cos(time*.11)*(portrait?.014:.045)-pointerY*.055;
      yaw += (targetYaw-yaw)*.055; pitch += (targetPitch-pitch)*.055;
      if (force && isPaused) {yaw=targetYaw;pitch=targetPitch;}
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER,positionBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER,0,positions);
      gl.uniform1f(uniforms.uAspect,width/height);
      gl.uniform1f(uniforms.uYaw,yaw); gl.uniform1f(uniforms.uPitch,pitch);
      gl.uniform1f(uniforms.uPixelRatio,ratio);
      // Portrait fills the frame. Wider forms have more breathing room on phones.
      const pointScale = (mobile.matches ? .94 : 1) * (portrait ? 1.15 : 1);
      gl.uniform1f(uniforms.uPointScale,pointScale);
      // Preserve a portrait's height when it fits, and leave breathing room
      // around wide three-dimensional forms on narrow/tall displays.
      const aspectNeeded = [.76, .8, 1.02, 1, 1.2, 1][currentChapter];
      const targetScale = mobile.matches ? Math.min(1, (width / height) / aspectNeeded) : 1;
      modelScale = force || isPaused ? targetScale : modelScale + (targetScale - modelScale) * .07;
      gl.uniform1f(uniforms.uModelScale,modelScale);
      gl.uniform1f(uniforms.uTime,time);
      gl.uniform1f(uniforms.uMovement,isPaused?0:1);
      gl.drawArrays(gl.POINTS,0,total);
    }
    const observer = new ResizeObserver(resize); observer.observe(scene);
    const visibilityObserver = new IntersectionObserver(entries => {
      sceneVisible = entries[0].isIntersecting;
      if (!sceneVisible) {cancelAnimationFrame(animationId); animationId=0;}
      else {lastFrame=0;ensureFrame();if(isPaused)draw(performance.now(),true);}
    });
    visibilityObserver.observe(scene);
    window.addEventListener('pointermove', event => {
      const bounds = scene.getBoundingClientRect();
      pointerX = Math.max(-1,Math.min(1,((event.clientX-bounds.left)/bounds.width-.5)*2));
      pointerY = Math.max(-1,Math.min(1,((event.clientY-bounds.top)/bounds.height-.5)*2));
    },{passive:true});
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {cancelAnimationFrame(animationId); animationId=0;}
      else {lastFrame=0;ensureFrame();if(isPaused)draw(performance.now(),true);}
    });
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); contextLost=true; cancelAnimationFrame(animationId); animationId=0;
      scene.classList.remove('ready');
    });
    canvas.addEventListener('webglcontextrestored', () => window.location.reload());
    const portrait = new Image();
    portrait.onload = () => {
      try {
        const sampler = document.createElement('canvas');
        sampler.width=360; sampler.height=Math.round(360*portrait.naturalHeight/portrait.naturalWidth);
        const context = sampler.getContext('2d',{willReadFrequently:true});
        context.drawImage(portrait,0,0,sampler.width,sampler.height);
        const rgba = context.getImageData(0,0,sampler.width,sampler.height).data;
        const pixels=[];
        for(let y=0;y<sampler.height;y++) for(let x=0;x<sampler.width;x++) {
          const k=(y*sampler.width+x)*4;
          const lum=(rgba[k]*.2126+rgba[k+1]*.7152+rgba[k+2]*.0722)/255;
          const darkness=1-lum;
          // Keep ink and soft facial contours; the white paper contributes no points.
          if(darkness>.085 && random()<Math.pow(darkness,.58)) pixels.push([x,y,darkness,rgba[k+2]-rgba[k]]);
        }
        if (!pixels.length) throw new Error('Empty portrait');
        forms[0]=makeForm((i) => {
          const pixel=pixels[Math.min(pixels.length-1,Math.floor(i*pixels.length/count))];
          const x=(pixel[0]/sampler.width-.5)*4.35;
          const y=(.5-pixel[1]/sampler.height)*5.8;
          const z=.12*Math.cos(x*1.1)+pixel[2]*.08+rand(-.025,.025);
          return [x,y,z];
        });
        portraitReady=true;
        if(currentChapter===0) {
          positions.set(forms[0]); from.set(forms[0]); transitionStart=-Infinity;
        }
        draw(performance.now(),true); scene.classList.add('ready');
        ensureFrame();
      } catch(error) { scene.classList.remove('ready'); }
    };
    portrait.onerror=() => {
      if(currentChapter!==0)scene.classList.add('ready');
    };
    portrait.src='assets/portrait-ink.png';
    resize();
    if(currentChapter!==0)scene.classList.add('ready');
    ensureFrame();
    return {setChapter(index){setChapter(index);if(portraitReady||index!==0)scene.classList.add('ready');else scene.classList.remove('ready');},setPaused};
  }
  try {renderer=createRenderer();} catch(error) {scene.classList.remove('ready');}
})();
