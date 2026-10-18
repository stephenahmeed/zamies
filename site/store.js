// Shared simulated state for all pages (localStorage)
(function(){
let RA=null;try{RA=localStorage.getItem('zx-addr')||null;localStorage.removeItem('zamiesx-v2');localStorage.setItem('zx-mode','real')}catch(_){}
// Live-only build: always reads Sepolia; no simulated data. RA = connected wallet (may be null = read-only).
const REAL=true,short=a=>a.slice(0,6)+'…'+a.slice(-4);
const TOTAL=4444,ME=RA?short(RA):'not connected',KEY=RA?'zamiesx-real3-'+RA.toLowerCase():'zamiesx-ro',FEE=0,ROY=.065;
let SEED={};try{SEED=JSON.parse(localStorage.getItem(KEY+'-seed')||'{}')}catch(_){}
const sk=id=>{const v=SEED[id];if(!v)return 0;const b=BigInt(v);return Number(b%4294967291n)|0};
function rng(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const HX=n=>{let s='';for(let i=0;i<n;i++)s+=(Math.random()*16|0).toString(16);return s};
const dh=(seed,n)=>{const r=rng(seed);let s='';for(let i=0;i<n;i++)s+=(r()*16|0).toString(16);return s};
const POOL=[...Array(64)].map((_,i)=>'0x'+dh(i*91+3,4)+'…'+dh(i*17+9,4));
const pick=a=>a[Math.random()*a.length|0];
const RAR=['Common','Rare','Epic','Legendary'],CLS=['Sun','Ember','Honey','Void'],ELM=['Flame','Static','Nectar','Shadow'];
function traits(id){const r=rng(sk(id)?sk(id)^(id*977+13):id*977+13),p=r();return{rar:p<.5?0:p<.8?1:p<.95?2:3,cl:r()*4|0,el:r()*4|0,horn:r()*3|0,eye:r()*3|0,sting:r()*100|0,speed:r()*100|0,honey:r()*100|0,luck:r()*100|0}}
const handle=(id,k=0)=>'0x'+dh(id*7919+k*131,64);
function grid(id){const T=traits(id),r=rng(sk(id)?(sk(id)>>>3)^(id*31+5):id*31+5),N=12,g=[...Array(N)].map(()=>Array(N).fill(0));
 for(let y=2;y<11;y++)for(let x=2;x<6;x++){const d=Math.hypot((x-5.5)/3.6,(y-6.3)/4.2);if(d<.62||(d<1&&r()<1-d*.7)){const c=r()<.18?3:r()<.3?2:1;g[y][x]=c;g[y][11-x]=c}}
 for(let y=4;y<9;y++)for(let x=3;x<9;x++)if(!g[y][x])g[y][x]=1;
 if(T.horn){const x=T.horn==1?3:4;g[1][x]=g[1][11-x]=2;g[0][x]=g[0][11-x]=T.rar==3?5:2}
 const ey=T.eye==2?4:5;g[ey][4]=g[ey][7]=4;if(T.eye==1)g[ey][5]=g[ey][6]=4;g[8][5]=g[8][6]=6;if(T.el==1)for(let x=2;x<10;x+=2)g[10][x]=g[10][x]||2;return g}
const PAL=[['#FFD208','#ff9d00','#fff3a0'],['#ff6a1a','#b8220d','#ffd08a'],['#ffc531','#c78100','#fff0b8'],['#a58bff','#4c34c4','#e6dcff']];
const pc=(v,P)=>v==1?P[0]:v==2?P[1]:v==3?P[2]:v==4?'#fff':v==5?'#FFD208':'#120d00';
function svgArt(id){const g=grid(id),T=traits(id),P=PAL[T.cl];let s=`<svg viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect width="12" height="12" fill="${T.rar==3?'#1d1600':'#08080a'}"/>`;g.forEach((row,y)=>row.forEach((v,x)=>{if(v)s+=`<rect x="${x}" y="${y}" width="1" height="1" fill="${pc(v,P)}"/>`}));return s+'</svg>'}
function init(){const S={v:2,own:new Array(TOTAL+1).fill(null),minted:0,next:1,mine:[],bal:500,dec:{},pub:{},list:{},hist:{},act:[],offers:[],inOffers:{},coffer:null,conn:false,wins:0,losses:0,eye:false};
 const now=Date.now();if(REAL){S.bal=0;S.zama=0;S.mintedBy=0;return S}
 for(let i=0;i<1234;i++){const id=S.next++;S.own[id]=id<=44?'team multisig':pick(POOL);S.minted++}
 for(let id=45;id<=1234;id++){if(Math.random()<.14)S.pub[id]=1;if(Math.random()<.13)S.list[id]={p:+(16+Math.random()*44).toFixed(1),seller:S.own[id],ts:now-Math.random()*864e5}}
 const T=['mint','sale','list','cancel','price','publish'];for(let i=0;i<60;i++){const id=45+(Math.random()*1190|0);S.act.push({type:pick(T),id,p:+(18+Math.random()*30).toFixed(1),from:pick(POOL),to:pick(POOL),ts:now-i*95e3})}
 return S}
let S;if(!REAL){try{S=JSON.parse(localStorage.getItem(KEY))}catch(_){}}if(!S||S.v!==2)S=init();S.conn=!!RA;S.eye=false
let sv;const save=()=>{if(REAL){try{localStorage.setItem(KEY+'-seed',JSON.stringify(SEED))}catch(_){}return}clearTimeout(sv);sv=setTimeout(()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(_){}},250)};
const L=[];const on=f=>L.push(f),emit=e=>{L.forEach(f=>{try{f(e)}catch(err){console.warn(err)}})};
function hist(id){if(!S.hist[id]){if(!S.own[id])return[];const r=rng(id*13+1),k=r()*3|0,h=[];let ts=Date.now()-(20+r()*10)*864e5,who=k?POOL[r()*64|0]:S.own[id];h.push({type:'mint',to:who,p:20,ts});
  let p=20+r()*10;for(let i=0;i<k;i++){ts+=r()*5*864e5;p=Math.max(10,p*(.8+r()*.6));const to=i==k-1?S.own[id]:POOL[r()*64|0];h.push({type:'sale',from:who,to,p:+p.toFixed(1),ts});who=to}S.hist[id]=h}return S.hist[id]}
function act(type,o){const e={type,ts:Date.now(),...o};S.act.unshift(e);if(S.act.length>300)S.act.length=300;if(o.id&&S.hist[o.id])S.hist[o.id].push(e);save();emit(e);return e}
const Z={REAL,LIVE:true,ADDR:RA||null,short,SEED,TOTAL,ME,FEE,ROY,S,POOL,RAR,CLS,ELM,traits,handle,svgArt,grid,PAL,pc,HX,rng,on,emit,save,hist,act,
 left:()=>TOTAL-S.minted,mine:()=>{const o=[];for(let i=1;i<S.next;i++)if(S.own[i]===ME)o.push(i);return o},
 isVisible:id=>!!((S.pub[id]&&(!REAL||SEED[id]))||(!S.list[id]&&S.own[id]===ME&&S.dec[id]&&(!REAL||SEED[id]))),
 take(w){if(S.next>TOTAL)return 0;const id=S.next++;S.own[id]=w;S.minted++;if(w===ME){S.mine.push(id);S.hist[id]=[]}act('mint',{id,to:w,p:20});return id},
 list(id,p){if(S.own[id]!==ME)return 0;S.list[id]={p:+p,seller:ME,ts:Date.now()};act('list',{id,from:ME,p:+p});return 1},
 edit(id,p){const l=S.list[id];if(!l||l.seller!==ME)return 0;const old=l.p;l.p=+p;act('price',{id,from:ME,p:+p,old});return 1},
 cancel(id){const l=S.list[id];if(!l||l.seller!==ME)return 0;delete S.list[id];act('cancel',{id,from:ME,p:l.p});return 1},
 buy(id){const l=S.list[id];if(!l||l.seller===ME||S.own[id]!==l.seller)return 'gone';if(S.bal<l.p)return 'funds';S.bal=+(S.bal-l.p).toFixed(2);const from=l.seller;S.own[id]=ME;delete S.list[id];delete S.dec[id];act('sale',{id,from,to:ME,p:l.p});return 'ok'},
 publish(id){if(S.own[id]!==ME||S.pub[id])return 0;S.pub[id]=1;act('publish',{id,from:ME});return 1},
 offer(id,p){S.offers.push({id,p:+p,ts:Date.now()});act('offer',{id,from:ME,p:+p})},
 cancelOffer(i){const o=S.offers.splice(i,1)[0];if(o)act('cancel',{id:o.id,from:ME,p:o.p,offer:1})},
 collOffer(p,q){S.coffer=p?{p:+p,q:+q}:null;if(p)act('offer',{id:0,from:ME,p:+p,coll:q});else save();emit({type:'ui'})},
 accept(id,i){const o=(S.inOffers[id]||[])[i];if(!o||S.own[id]!==ME)return 0;delete S.list[id];S.own[id]=o.from;S.bal=+(S.bal+o.p*(1-FEE-ROY)).toFixed(2);delete S.dec[id];delete S.inOffers[id];act('sale',{id,from:ME,to:o.from,p:o.p});return 1}};
// simulated traders
function tick(){const r=Math.random(),ids=Object.keys(S.list).map(Number);
 if(r<.2&&Z.left()>0)Z.take(pick(POOL));
 else if(r<.42&&ids.length){const id=pick(ids),l=S.list[id];if(l.seller===ME&&Math.random()>.12)return;const to=pick(POOL);delete S.list[id];S.own[id]=to;if(l.seller===ME){S.bal=+(S.bal+l.p*(1-FEE-ROY)).toFixed(2);delete S.dec[id];emit({type:'toast',msg:`Your Zamies #${id} sold for ${l.p} cZAMA. The buyer now holds decrypt rights.`})}act('sale',{id,from:l.seller,to,p:l.p})}
 else if(r<.6){const id=45+(Math.random()*(S.next-46)|0);if(S.own[id]&&S.own[id]!==ME&&!S.list[id]){const p=+(16+Math.random()*44).toFixed(1);S.list[id]={p,seller:S.own[id],ts:Date.now()};act('list',{id,from:S.own[id],p})}}
 else if(r<.68&&ids.length){const id=pick(ids),l=S.list[id];if(l.seller!==ME){delete S.list[id];act('cancel',{id,from:l.seller,p:l.p})}}
 else if(r<.78&&ids.length){const id=pick(ids),l=S.list[id];if(l.seller!==ME){const old=l.p;l.p=+(l.p*(.85+Math.random()*.25)).toFixed(1);act('price',{id,from:l.seller,p:l.p,old})}}
 else if(r<.84){const id=45+(Math.random()*(S.next-46)|0);if(S.own[id]&&S.own[id]!==ME&&!S.pub[id]){S.pub[id]=1;act('publish',{id,from:S.own[id]})}}
 else if(r<.92){const m=Z.mine();if(m.length){const id=pick(m),p=+(12+Math.random()*30).toFixed(1),from=pick(POOL);(S.inOffers[id]=S.inOffers[id]||[]).push({from,p});act('offer',{id,from,to:ME,p})}}
 else if(S.coffer&&S.coffer.q>0&&S.bal>=S.coffer.p){const c=[];for(let i=45;i<S.next;i++)if(S.own[i]&&S.own[i]!==ME&&!S.list[i])c.push(i);if(c.length){const id=pick(c),from=S.own[id],cp=S.coffer.p;S.own[id]=ME;S.bal=+(S.bal-cp).toFixed(2);S.coffer.q--;if(!S.coffer.q)S.coffer=null;act('sale',{id,from,to:ME,p:cp,coll:1});emit({type:'toast',msg:`Collection offer accepted: Zamies #${id} is now yours (sealed).`})}}}
if(!REAL)setInterval(tick,3000);

// animated sealed cube (CSS 3D, deterministic from ciphertext handle)
const FACES=['rotateY(0deg)','rotateY(90deg)','rotateY(180deg)','rotateY(-90deg)','rotateX(90deg)','rotateX(-90deg)'];
Z.cube=function(id,extra=''){const hue=48,sp=14,dir='normal',dl=0,yel=0b101010,b=k=>[0,0,0,0,0,0,6,8,9,10,11,4][k]||0;
 const KW=['euint64','ebool','eaddress','euint8','FHE.add','FHE.select','FHE.eq','FHE.allow','ACL','KMS','relayer','handle'];
 const faces=FACES.map((t,k)=>{const tx=handle(id,k+1),r=rng(id*131+k*17);let s='';for(let n=0;n<14;n++){const o=(r()*48)|0;s+=(n%3==1?`<b>${KW[(r()*KW.length)|0]}</b>`:`<b>0x${tx.slice(o,o+12)}</b>`)+' '}
  return `<div class="f${(yel>>k)&1?' y':''}" style="--t:${t};--hs:${9+k}s"><div class="hx">${s}${s}</div><i></i><i></i></div>`}).join('');
 const ck=`<svg class="ck" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M50 50 L${20+b(6)%20} ${10+b(7)%15} M50 50 L${80+b(8)%15} ${30+b(9)%20} M50 50 L${30+b(10)%20} ${85+b(11)%10} M50 50 L${85} ${80} M50 50 L${8} ${55}" stroke="#FFE680" stroke-width=".8" fill="none" style="filter:drop-shadow(0 0 2px #FFD208)"/></svg>`;
 return `<div class="zc ${extra}" data-zc="${id}" style="--h:${hue};--sp:${sp}s;--dir:${dir};--dl:-${dl}s;--ph:-${(id*2.37)%14}s"><div class="bm"></div><div class="zs"><div class="cw"><div class="cb">${faces}</div></div></div>${ck}</div>`};
Z.crack=function(el,done){if(!el)return done&&done();el.classList.add('run','shake');setTimeout(()=>el.classList.add('crack'),900);setTimeout(()=>{el.classList.remove('shake');el.classList.add('shatter')},1500);setTimeout(()=>{el.remove();done&&done()},2400)};
// pause offscreen
if('IntersectionObserver' in window){const io=new IntersectionObserver(es=>es.forEach(e=>e.target.classList.toggle('run',e.isIntersecting)),{rootMargin:'80px'});
 const scan=()=>document.querySelectorAll('.zc:not([data-o])').forEach(el=>{el.dataset.o=1;io.observe(el)});
 new MutationObserver(()=>{clearTimeout(scan.k);scan.k=setTimeout(scan,30)}).observe(document.documentElement,{childList:true,subtree:true});addEventListener('DOMContentLoaded',scan)}
else document.addEventListener('DOMContentLoaded',()=>document.querySelectorAll('.zc').forEach(e=>e.classList.add('run')));

// ===== ALIVE pixel Zamies (SVG + CSS, one shared pointer loop) =====
Z.alive=function(id,cls=''){const g=grid(id),T=traits(id),P=PAL[T.cl],ey=T.eye==2?4:5,d=(id*37%50)/10;
 const eyes=T.eye==1?[[4,2],[6,2]]:[[4,1],[7,1]];let body='',horn='';
 g.forEach((row,y)=>row.forEach((v,x)=>{if(!v||v==4||v==6)return;const r=`<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${pc(v,P)}"/>`;if(y<=1)horn+=r;else body+=r}));
 const lid=P[0],pf=T.rar==3?'#FFD208':'#0b0b10';
 const ew=eyes.map(([x,w])=>`<rect x="${x}" y="${ey}" width="${w}" height="1" fill="#fff"/>`).join('');
 const pu=eyes.map(([x,w])=>`<rect class="zpu" x="${x+w/2-.27}" y="${ey+.23}" width=".54" height=".54" fill="${pf}"/>`).join('');
 const lids=eyes.map(([x,w])=>`<rect class="zlid" x="${x-.02}" y="${ey-.02}" width="${w+.04}" height="1.04" fill="${lid}"/>`).join('');
 const fxs=[`<g class="zfx zf0">${[2,5,8,10].map((x,i)=>`<rect x="${x}" y="9" width=".5" height=".5" fill="${i%2?'#ff7a1a':'#FFD208'}" style="animation-delay:${-i*.4-d}s"/>`).join('')}</g>`,
  `<g class="zfx zf1">${[[1,3],[10,5],[2,9]].map((p,i)=>`<polyline points="${p[0]},${p[1]} ${p[0]+.6},${p[1]+.5} ${p[0]+.1},${p[1]+.9} ${p[0]+.8},${p[1]+1.4}" fill="none" stroke="#9ff" stroke-width=".18" style="animation-delay:${-i*.37-d}s"/>`).join('')}</g>`,
  `<g class="zfx zf2">${[0,1].map(i=>`<ellipse cx="6" cy="11.4" rx="3" ry=".5" fill="none" stroke="#7cf" stroke-width=".12" style="animation-delay:${-i*1.1-d}s"/>`).join('')}</g>`,
  `<g class="zfx zf3">${[3,6,9].map((x,i)=>`<circle cx="${x}" cy="10" r=".9" fill="#5a4a7a" style="animation-delay:${-i*.9-d}s"/>`).join('')}</g>`][T.el];
 const leg=T.rar==3?`<circle class="zaura" cx="6" cy="6.3" r="5.2" fill="none" stroke="#FFD208" stroke-width=".25"/><g class="zorb">${[0,1,2].map(i=>`<rect x="${6+5.4*Math.cos(i*2.09)-.2}" y="${6.3+5.4*Math.sin(i*2.09)-.2}" width=".45" height=".45" fill="#FFD208"/>`).join('')}</g>`:'';
 const holo=T.rar==2?`<defs><linearGradient id="zh${id}" x1="0" x2="1"><stop offset="0" stop-color="#f0f" stop-opacity="0"/><stop offset=".4" stop-color="#0ff" stop-opacity=".55"/><stop offset=".55" stop-color="#ff0" stop-opacity=".55"/><stop offset="1" stop-color="#f0f" stop-opacity="0"/></linearGradient></defs><rect class="zholo" x="-6" y="-2" width="6" height="16" fill="url(#zh${id})"/>`:'';
 return `<svg class="za r${T.rar} ${cls}" data-za="${id}" viewBox="-1 -1.4 14 14" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" style="--d:-${d}s;--bk:${4+id%4}s"><rect x="-1" y="-1.4" width="14" height="14" fill="${T.rar==3?'#1d1600':'#08080a'}"/>${leg}${T.el==3?fxs:''}
 <g class="zl"><g class="zbob"><g class="zbr"><g class="zh">${horn}</g>${body}<g class="zeye ${id%3==0?'dbl':''}">${ew}<g class="zp">${pu}</g>${lids}</g>
 <g class="zm"><g class="m0"><rect x="5" y="8" width="2" height="1" fill="#120d00"/></g><g class="m1"><rect x="4.6" y="8" width=".6" height=".6" fill="#120d00"/><rect x="6.8" y="8" width=".6" height=".6" fill="#120d00"/><rect x="5.2" y="8.5" width="1.6" height=".6" fill="#120d00"/></g><g class="m2"><rect x="5.3" y="7.8" width="1.4" height="1.5" fill="#120d00"/><rect x="5.65" y="8.15" width=".7" height=".8" fill="#ff5a7a"/></g></g>
 <g class="zdz"><text x="6" y="-.2" font-size="1.4" text-anchor="middle" fill="#FFD208">✦ ✧ ✦</text></g></g></g></g>${T.el!=3?fxs:''}${holo}
 <g class="zconf">${[...Array(8)].map((_,i)=>`<rect x="${1+i*1.4}" y="-1" width=".5" height=".5" fill="${['#FFD208','#ff5a7a','#7cf','#fff'][i%4]}" style="animation-delay:${-i*.13}s"/>`).join('')}</g></svg>`};
(function(){const RM=matchMedia('(prefers-reduced-motion: reduce)').matches,live=new Set();let P=null,last=0,raf=0,tl=0;
 const io=window.IntersectionObserver?new IntersectionObserver(es=>es.forEach(e=>{e.target.classList.toggle('run',e.isIntersecting);e.isIntersecting?live.add(e.target):live.delete(e.target)}),{rootMargin:'60px'}):null;
 const scan=()=>document.querySelectorAll('svg.za:not([data-o])').forEach(el=>{el.dataset.o=1;if(io)io.observe(el);else{el.classList.add('run');live.add(el)}});
 new MutationObserver(()=>{clearTimeout(scan.k);scan.k=setTimeout(scan,30);for(const el of live)if(!el.isConnected)live.delete(el)}).observe(document.documentElement,{childList:true,subtree:true});
 function frame(t){raf=requestAnimationFrame(frame);if(RM||t-tl<33)return;tl=t;const idle=!P||t-last>4000;
  for(const el of live){if(el.classList.contains('dizzy'))continue;const r=el.getBoundingClientRect();if(!r.width)continue;const cx=r.left+r.width/2,cy=r.top+r.height*.45,id=+el.dataset.za;
   const tx=idle?cx+Math.cos(t/1600+id)*260:P[0],ty=idle?cy+Math.sin(t/1900+id*.7)*160:P[1];let dx=tx-cx,dy=ty-cy;const dd=Math.hypot(dx,dy)||1,k=Math.min(1,dd/(r.width*1.2));
   (el._zp||(el._zp=el.querySelector('.zp'))).setAttribute('transform',`translate(${(dx/dd*k*.26).toFixed(3)} ${(dy/dd*k*.22).toFixed(3)})`);
   el.style.setProperty('--lean',Math.max(-3.5,Math.min(3.5,dx/90)).toFixed(1)+'deg')}}
 if(!RM)raf=requestAnimationFrame(frame);
 const mv=e=>{P=[e.clientX,e.clientY];last=performance.now();const b=e.target.closest&&e.target.closest('.bigart.tilt');if(b&&!RM&&b.querySelector('svg.za')){const r=b.getBoundingClientRect();b.style.transform=`perspective(900px) rotateY(${((e.clientX-r.left)/r.width-.5)*16}deg) rotateX(${-((e.clientY-r.top)/r.height-.5)*16}deg)`}};
 addEventListener('pointermove',mv,{passive:true});
 document.addEventListener('pointerout',e=>{const b=e.target.closest&&e.target.closest('.bigart.tilt');if(b&&!b.contains(e.relatedTarget))b.style.transform=''});
 addEventListener('pointerdown',e=>{mv(e);const el=e.target.closest&&e.target.closest('svg.za');if(!el)return;el.classList.remove('clk');void el.getBoundingClientRect();el.classList.add('clk');clearTimeout(el._ck);el._ck=setTimeout(()=>el.classList.remove('clk'),700);
  },{passive:true});
 addEventListener('DOMContentLoaded',scan)})();
window.Z=Z;})();
