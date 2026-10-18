// Real Sepolia layer for Zamies X. Only active when the user connects an injected wallet (Z.REAL).
import {ethers} from './sdk/ethers.min.js';
import {ZABI,MABI,HABI} from './abi.js';
const Z=window.Z,S=Z.S,$=s=>document.querySelector(s);
const CH=11155111,CHX='0xaa36a7',RPC='https://ethereum-sepolia-rpc.publicnode.com';
const A={zamies:'0xb061a6337f1E6113F428539b832Fd1Db7347c9b0',market:'0x50Ad91dA587952674549c00cB76D287CaD93641E',hive:'0x30cFcdfd5dd8f398E37C390d21fd7B01038dF57f',streaks:'0x10313c712855aec43814dC89313e1Dc22FC72958',cw:'0x63fB659856c96fc240c8649114e26a634b09c62a',czama:'0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB',zama:'0x75355a85c6FB9df5f0C80FF54e8747EEe9a0BF57',mc:'0xcA11bde05977b3631167028862bE2a173976CA11',team:'0x027990b9ab3102bdc757d1738f23630fbaa34f0d'};
const CABI=['function setOperator(address,uint48)','function isOperator(address,address) view returns(bool)','function confidentialBalanceOf(address) view returns(bytes32)','function wrap(address,uint256)'];
const EABI=['function mint(address,uint256)','function approve(address,uint256) returns(bool)','function allowance(address,address) view returns(uint256)','function balanceOf(address) view returns(uint256)'];
const SABI=['function checkIn()','function streakOf(address) view returns(uint256)','function bestStreakOf(address) view returns(uint256)','function lastCheckInOf(address) view returns(uint256)'],RABI=['function isQueenHolder(address) view returns(bool)','function minBalance() view returns(uint256)','function minStreak() view returns(uint256)'],HX2=['function queenRegistry() view returns(address)','function weightOf(uint256) view returns(uint256)','function poke(uint256)'];
const MCABI=['function aggregate3((address target,bool allowFailure,bytes callData)[]) view returns((bool success,bytes returnData)[])'];
const rp=new ethers.JsonRpcProvider(RPC,CH,{staticNetwork:true});
const zr=new ethers.Contract(A.zamies,ZABI,rp),mr=new ethers.Contract(A.market,MABI,rp),cr=new ethers.Contract(A.czama,CABI,rp),er=new ethers.Contract(A.zama,EABI,rp),mc=new ethers.Contract(A.mc,MCABI,rp),hr=new ethers.Contract(A.hive,HABI,rp),sr=new ethers.Contract(A.streaks,SABI,rp),rr=new ethers.Contract(A.cw,RABI,rp),hx=new ethers.Contract(A.hive,HX2,rp);
const toast=m=>window.toastA?window.toastA(m):console.log(m);
const ADDR=Z.ADDR?ethers.getAddress(Z.ADDR):null;
const nm=a=>{if(!a)return null;const l=a.toLowerCase();if(ADDR&&l===ADDR.toLowerCase())return Z.ME;if(l===A.team)return 'team '+Z.short(a);return Z.short(ethers.getAddress(a))};
const err=e=>(e&&(e.shortMessage||e.reason||e.info?.error?.message||e.message)||String(e)).toString().slice(0,140);

async function ensureChain(){const id=await ethereum.request({method:'eth_chainId'});if(id===CHX)return;
 try{await ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:CHX}]})}catch(e){if(e.code===4902||/Unrecognized|not added/i.test(e.message||''))await ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:CHX,chainName:'Sepolia',nativeCurrency:{name:'Sepolia ETH',symbol:'ETH',decimals:18},rpcUrls:[RPC],blockExplorerUrls:['https://sepolia.etherscan.io']}]});else throw e}}
async function connect(){const acc=await ethereum.request({method:'eth_requestAccounts'});await ensureChain();localStorage.setItem('zx-addr',acc[0]);localStorage.setItem('zx-mode','real');location.reload()}
function disconnect(){localStorage.removeItem('zx-addr');location.reload()}
let _signer;async function signer(){if(!window.ethereum)throw new Error('No wallet');await ensureChain();if(!_signer)_signer=await new ethers.BrowserProvider(ethereum).getSigner();if(_signer.address.toLowerCase()!==ADDR.toLowerCase())throw new Error('Wallet account changed, reload the page');return _signer}
const W=async()=>{const s=await signer();return{z:new ethers.Contract(A.zamies,ZABI,s),m:new ethers.Contract(A.market,MABI,s),c:new ethers.Contract(A.czama,CABI,s),e:new ethers.Contract(A.zama,EABI,s),h:new ethers.Contract(A.hive,HABI,s),s:new ethers.Contract(A.streaks,SABI,s),hx:new ethers.Contract(A.hive,HX2,s)}};
// ---- Zama relayer SDK (lazy: ~6MB wasm)
// Relayer URL comes from config.js (null = SDK default). On mainnet it must be the backend proxy (API key stays server-side).
const RELAYER_URL=(window.ZAMIES_CONFIG&&window.ZAMIES_CONFIG.relayerUrl)||null;
let _fhe;async function fhe(){if(!_fhe)_fhe=(async()=>{const m=await import('./sdk/relayer-sdk-js.js');await m.initSDK();return m.createInstance({...m.SepoliaConfig,network:RPC,...(RELAYER_URL?{relayerUrl:RELAYER_URL}:{})})})();try{return await _fhe}catch(e){_fhe=null;throw e}}
async function publicDecrypt(h,st){const f=await fhe();for(let i=0;i<30;i++){try{const r=await f.publicDecrypt([h]);const k=Object.keys(r.clearValues).find(x=>x.toLowerCase()===h.toLowerCase());return{clear:r.clearValues[k],proof:r.decryptionProof}}catch(e){st&&st(`KMS decrypt pending (${i+1})…`);await new Promise(s=>setTimeout(s,5000))}}throw new Error('Relayer public decrypt timed out')}
async function userDecrypt(pairs){const f=await fhe();const KK='zx-udk-'+ADDR.toLowerCase();let k=null;try{k=JSON.parse(sessionStorage.getItem(KK))}catch(_){}
 const now=Math.floor(Date.now()/1000);if(!k||k.ts+86000<now||!(k.cs||[]).includes(A.hive)){const kp=f.generateKeypair(),ts=now,cs=[A.zamies,A.czama,A.hive];const eip=f.createEIP712(kp.publicKey,cs,ts,1);const s=await signer();
  const sig=await s.signTypedData(eip.domain,{UserDecryptRequestVerification:eip.types.UserDecryptRequestVerification},eip.message);k={...kp,sig:sig.replace(/^0x/,''),ts,cs};sessionStorage.setItem(KK,JSON.stringify(k))}
 const r=await f.userDecrypt(pairs,k.privateKey,k.publicKey,k.sig,k.cs,ADDR,k.ts,1);return pairs.map(p=>{const key=Object.keys(r).find(x=>x.toLowerCase()===p.handle.toLowerCase());return r[key]})}
const ZERO=/^0x0+$/;
// ---- on-chain activity (event logs from Zamies, Market, Hive)
const DEPLOY_BLOCK=11914917,DEAD='0x000000000000000000000000000000000000dead';let EV={from:DEPLOY_BLOCK,logs:[],busy:false};const BT={};S.actLoaded=false;
async function loadEvents(){if(EV.busy)return;EV.busy=true;try{const tip=await rp.getBlockNumber();const STEP=45000;
 for(let b=EV.from;b<=tip;b+=STEP){const to=Math.min(tip,b+STEP-1);const l=await rp.getLogs({address:[A.zamies,A.market,A.hive],fromBlock:b,toBlock:to});EV.logs.push(...l)}EV.from=tip+1;
 const need=[...new Set(EV.logs.map(l=>l.blockNumber))].filter(n=>!BT[n]);for(let k=0;k<need.length;k+=10)await Promise.all(need.slice(k,k+10).map(async n=>{const bl=await rp.getBlock(n);BT[n]=bl?bl.timestamp*1000:Date.now()}));
 buildAct()}finally{EV.busy=false}}
function buildAct(){const zi=zr.interface,mi=mr.interface,hi=hr.interface,mk=A.market.toLowerCase(),hv=A.hive.toLowerCase();const out=[],lp={},pur={},off={},burned={};
 const L=[...EV.logs].sort((a,b)=>a.blockNumber-b.blockNumber||a.index-b.index);
 for(const l of L){const ad=l.address.toLowerCase();let e=null;try{e=(ad===mk?mi:ad===hv?hi:zi).parseLog(l)}catch(_){}if(!e)continue;const ts=BT[l.blockNumber]||Date.now(),tx=l.transactionHash,g=e.args;const add=o=>out.push({ts,tx,...o});
  if(ad!==mk&&ad!==hv){if(e.name==='Transfer'){const f=g[0].toLowerCase(),t=g[1].toLowerCase(),id=Number(g[2]);if(f===ethers.ZeroAddress)add({type:'mint',id,to:nm(g[1])});else if(f!==mk&&t!==mk&&t!==DEAD)add({type:'transfer',id,from:nm(g[0]),to:nm(g[1])})}
   else if(e.name==='Published')add({type:'reveal',id:Number(g[0]),from:nm(g[1])});continue}
  if(ad===mk){const n=e.name;
   if(n==='Listed'){const id=Number(g[0]);lp[id]={p:Number(g[2])/1e6,seller:g[1]};add({type:'list',id,from:nm(g[1]),p:lp[id].p})}
   else if(n==='Cancelled')add({type:'cancel',id:Number(g[0]),from:lp[Number(g[0])]?nm(lp[Number(g[0])].seller):null});
   else if(n==='PriceUpdated'){const id=Number(g[0]);if(lp[id])lp[id].p=Number(g[1])/1e6;add({type:'price',id,from:lp[id]?nm(lp[id].seller):null,p:Number(g[1])/1e6})}
   else if(n==='PurchaseRequested')pur[String(g[0])]={buyer:g[1],ids:[...g[2]].map(Number)};
   else if(n==='PurchaseFinalized'){const P=pur[String(g[0])];if(P&&g[1])P.ids.forEach(id=>add({type:'sale',id,from:lp[id]?nm(lp[id].seller):null,to:nm(P.buyer),p:lp[id]?lp[id].p:null}))}
   else if(n==='OfferRequested')off[String(g[0])]={id:Number(g[1]),bidder:g[2],p:Number(g[3])/1e6};
   else if(n==='OfferActivated'){const O=off[String(g[0])];if(O&&g[1])add({type:'offer',id:O.id,from:nm(O.bidder),p:O.p})}
   else if(n==='OfferAccepted'){const O=off[String(g[0])];add({type:'sale',id:Number(g[1]),from:nm(g[2]),to:O?nm(O.bidder):null,p:O?O.p:null})}
   else if(n==='CubeBurned'){const id=Number(g[0]);burned[id]=1;add({type:'burn',id,from:nm(g[2]),p:Number(g[1])/1e6})}}
  else{if(e.name==='SealedAndEarning')add({type:'seal',id:Number(g[0]),from:nm(g[1])});else if(e.name==='Claimed')add({type:'claim',id:Number(g[0]),from:S.own[Number(g[0])]||null})}}
 out.reverse();S.act.length=0;S.act.push(...out);S.burnedIds=burned;S.actLoaded=true;
 for(const id in S.own)S.hist[id]=out.filter(a=>a.id==id&&['mint','sale','transfer','burn','reveal','seal'].includes(a.type)).map(a=>({type:a.type,from:a.from,to:a.to,p:a.p,ts:a.ts}));
 redraw()}
// Revealed cubes: seed is publicly decryptable via relayer/KMS, so anyone can render art + traits.
const PUBSEED={};let _pl=false;
async function loadPublic(list,force){if(_pl&&!force)return;_pl=true;try{const f=await fhe();for(let k=0;k<list.length;k+=20){const ch=list.slice(k,k+20);const hs=await Promise.all(ch.map(id=>zr.publicSeedOf(id)));const r=await f.publicDecrypt(hs);ch.forEach((id,j)=>{const key=Object.keys(r.clearValues).find(x=>x.toLowerCase()===hs[j].toLowerCase());if(key!=null){PUBSEED[id]=Z.SEED[id]=r.clearValues[key].toString();if(window.__mint)window.__mint.dirty&&window.__mint.dirty(id)}})}Z.save();redraw()}finally{_pl=false}}
async function decryptSeed(id){const h=await zr.seedOf(id);const [v]=await userDecrypt([{handle:h,contractAddress:A.zamies}]);Z.SEED[id]=v.toString();S.dec[id]=1;Z.save();return v}
async function decryptBalance(){try{toast('Sign the decrypt request in your wallet…');const h=await cr.confidentialBalanceOf(ADDR);let v=0n;if(!ZERO.test(h))[v]=await userDecrypt([{handle:h,contractAddress:A.czama}]);S.bal=Number(v)/1e6;S.balKnown=true;S.eye=true;toast('cZAMA balance decrypted: '+S.bal+' (only you can see it)');redraw()}catch(e){toast('Decrypt failed: '+err(e))}}
// ---- reads
let busyR=0,first=1;
async function refresh(){if(busyR)return;busyR=1;try{
 const [team,pub,mb]=await Promise.all([zr.teamMinted(),zr.publicMinted(),ADDR?zr.mintedBy(ADDR):0n]);const n=Number(team)+Number(pub);
 const ids=[];for(let i=1;i<=44&&i<=Number(team);i++)ids.push(i);for(let i=1;i<=Number(pub);i++)ids.push(44+i);
 const owners={};const zi=zr.interface,mi=mr.interface;
 for(let k=0;k<ids.length;k+=400){const ch=ids.slice(k,k+400);const res=await mc.aggregate3(ch.map(id=>({target:A.zamies,allowFailure:true,callData:zi.encodeFunctionData('ownerOf',[id])})));res.forEach((r,j)=>{if(r.success)owners[ch[j]]=zi.decodeFunctionResult('ownerOf',r.returnData)[0]})}
 const listed=ids.filter(id=>owners[id]&&owners[id].toLowerCase()===A.market.toLowerCase());const L={};
 for(let k=0;k<listed.length;k+=400){const ch=listed.slice(k,k+400);const res=await mc.aggregate3(ch.map(id=>({target:A.market,allowFailure:true,callData:mi.encodeFunctionData('listings',[id])})));res.forEach((r,j)=>{if(r.success){const l=mi.decodeFunctionResult('listings',r.returnData);if(l[0]!==ethers.ZeroAddress)L[ch[j]]={seller:l[0],price:Number(l[1])/1e6,locked:l[2]}}})}
 let changed=false;const fresh=[];
 try{const PB=[];for(let k=0;k<ids.length;k+=400){const ch=ids.slice(k,k+400);const res=await mc.aggregate3(ch.map(id=>({target:A.zamies,allowFailure:true,callData:zi.encodeFunctionData('published',[id])})));res.forEach((r,j)=>{if(r.success&&zi.decodeFunctionResult('published',r.returnData)[0])PB.push(ch[j])})}
  for(const id of PB)if(!S.pub[id]){S.pub[id]=1;changed=true}const need=PB.filter(id=>!PUBSEED[id]);if(need.length)loadPublic(need).catch(e=>console.log('public decrypt',err(e)))}catch(e){console.log('revealed read',err(e))}
 for(const id of ids){const o=L[id]?L[id].seller:owners[id];const v=nm(o);if(S.own[id]!==v){if(!S.own[id])fresh.push(id);S.own[id]=v;changed=true;S.hist[id]=S.hist[id]||[{type:'mint',to:v,p:id>44?20:0,ts:Date.now()}];if(window.__mint)window.__mint.dirty(id)}}
 const nl={};for(const id in L)nl[id]={p:L[id].price,seller:nm(L[id].seller),ts:(S.list[id]&&S.list[id].ts)||Date.now(),locked:L[id].locked};
 if(JSON.stringify(Object.keys(nl).map(k=>[k,nl[k].p,nl[k].seller]))!==JSON.stringify(Object.keys(S.list).map(k=>[k,S.list[k].p,S.list[k].seller])))changed=true;
 for(const k in S.list)delete S.list[k];Object.assign(S.list,nl);
 try{S.trading=await mr.tradingOpen();document.body.classList.toggle('tl',!S.trading);const oc=Number(await mr.offerCount());const OF=[];for(let k=1;k<=oc;k+=400){const ch=[];for(let q=k;q<Math.min(oc+1,k+400);q++)ch.push(q);const res=await mc.aggregate3(ch.map(q=>({target:A.market,allowFailure:true,callData:mi.encodeFunctionData('getOffer',[q])})));res.forEach((r,j)=>{if(r.success){const g=mi.decodeFunctionResult('getOffer',r.returnData);OF.push({oid:ch[j],bidder:g[0],id:Number(g[1]),p:Number(g[2])/1e6,st:Number(g[3])})}})}
  const myo=[],inc={};for(const o of OF){if(o.st!==1&&o.st!==2)continue;if(ADDR&&o.bidder.toLowerCase()===ADDR.toLowerCase())myo.push({id:o.id,p:o.p,oid:o.oid,pending:o.st===1,ts:Date.now()});else if(o.st===2)(inc[o.id]=inc[o.id]||[]).push({from:nm(o.bidder),p:o.p,oid:o.oid})}
  if(JSON.stringify([myo.map(o=>[o.oid,o.pending]),inc])!==JSON.stringify([S.offers.map(o=>[o.oid,o.pending]),S.inOffers]))changed=true;S.offers=myo;S.inOffers=inc}catch(e){console.warn('offers',e)}
 try{const [tt,sc,gw,cb]=await Promise.all([hr.totalDecryptedToHolders(),hr.sealedCount(),mr.burnGatewayBalance(),mr.cubesBurned()]);S.hive={total:Number(tt)/1e6,count:Number(sc),gw:Number(gw)/1e6,burned:Number(cb)};const hi=hr.interface;const sres=await mc.aggregate3(ids.map(id=>({target:A.hive,allowFailure:true,callData:hi.encodeFunctionData('isSealed',[id])})));const sl={};sres.forEach((r,j)=>{if(r.success&&hi.decodeFunctionResult('isSealed',r.returnData)[0])sl[ids[j]]=1});if(JSON.stringify(sl)!==JSON.stringify(S.sealed||{}))changed=true;S.sealed=sl}catch(e){console.warn('hive',e)}
 try{const [qr,mb,ms]=await Promise.all([hx.queenRegistry(),rr.minBalance(),rr.minStreak()]);const cw={linked:qr.toLowerCase()===A.cw.toLowerCase(),reg:qr,mb:Number(mb),ms:Number(ms)};if(ADDR){const [q,st,be,la]=await Promise.all([rr.isQueenHolder(ADDR),sr.streakOf(ADDR),sr.bestStreakOf(ADDR),sr.lastCheckInOf(ADDR)]);Object.assign(cw,{on:q,st:Number(st),best:Number(be),last:Number(la)})}const sid=Object.keys(S.sealed||{});if(sid.length){const hi=hx.interface;const wr=await mc.aggregate3(sid.map(id=>({target:A.hive,allowFailure:true,callData:hi.encodeFunctionData('weightOf',[id])})));cw.w={};wr.forEach((r,j)=>{if(r.success)cw.w[sid[j]]=Number(hi.decodeFunctionResult('weightOf',r.returnData)[0])})}if(JSON.stringify(cw)!==JSON.stringify(S.cw||{}))changed=true;S.cw=cw}catch(e){console.warn('cw',e)}
 try{const fd=await rp.getFeeData();S.gas=Number(ethers.formatUnits(fd.gasPrice||0n,'gwei'))}catch(_){}
 S.minted=n;S.next=45+Number(pub);if(Number(team)<44)S.next=Math.max(Number(team)+1,S.next);S.mintedBy=Number(mb);
 const mine=[];for(let i=1;i<S.next;i++)if(S.own[i]===Z.ME)mine.push(i);S.mine=mine;
 if(ADDR){try{S.zama=Number(ethers.formatUnits(await er.balanceOf(ADDR),18))}catch(_){}}
 if(!first)fresh.forEach(id=>{Z.emit({type:'mint',id,to:S.own[id]})});
 else{if(window.__mint)ids.slice(-8).forEach(id=>window.__mint.mintEvt(id,S.own[id]))}
 loadEvents().catch(e=>console.log('events',err(e)));
 if(window.__mint){mine.forEach(id=>{window.__mint.trayAdd(id)});window.__mint.paint();window.__mint.ui()}
 first=0;if(changed)redraw()}catch(e){console.warn('refresh',e)}finally{busyR=0}}
function redraw(){Z.emit({type:'ui'});const md=$('#md');if(window.appRender&&!(md&&md.classList.contains('on')))window.appRender()}
// ---- tx helpers / progress modal
function steps(title){const md=$('#md');md.innerHTML=`<div class="box2"><h3>${title}</h3><div class="steps" id="txs"></div><div class="cipher" id="txc"></div><div class="row2" style="justify-content:flex-end;margin-top:10px"><button class="b g" data-x id="txx" disabled>Close</button></div></div>`;md.classList.add('on');
 const L=[];const draw=()=>{$('#txs').innerHTML=L.map((s,k)=>`<div class="s ${s.ok?'ok':s.bad?'':'on'}"><i>${s.ok?'✓':s.bad?'✗':'▸'}</i><div>${s.t}${s.h?`<code><a href="https://sepolia.etherscan.io/tx/${s.h}" target="_blank" rel="noopener" style="color:var(--y)">${s.h.slice(0,18)}… ↗</a></code>`:''}</div></div>`).join('');$('#txc').textContent=[...Array(3)].map(()=>Z.HX(64)).join(' ')};
 return{add(t){L.forEach(s=>{if(!s.bad)s.ok=1});L.push({t});draw()},hash(h){L[L.length-1].h=h;draw()},done(msg){L.forEach(s=>{if(!s.bad)s.ok=1});if(msg)L.push({t:msg,ok:1});draw();$('#txx').disabled=false},fail(m){L.push({t:m,bad:1});L[L.length-2]&&(L[L.length-2].bad=1);draw();$('#txx').disabled=false}}}
async function send(P,label,fn){P.add(label+' · confirm in wallet');const tx=await fn();P.hash(tx.hash);P.add('Waiting for Sepolia confirmation…');const r=await tx.wait();if(r.status!==1)throw new Error(label+' reverted');return r}
async function ensureOperator(P,c,spender){const ok=await cr.isOperator(ADDR,spender).catch(()=>false);if(ok)return;await send(P,'Allow '+(spender===A.zamies?'Zamies':'Market')+' to move your cZAMA (setOperator, 30 days)',()=>c.setOperator(spender,Math.floor(Date.now()/1000)+30*86400))}
// ---- mint
async function mint(n,st){const w=await W();const P={add:t=>st(t),hash:h=>st('tx '+h.slice(0,12)+'…'),done(){},fail(){}};
 await ensureOperator(P,w.c,A.zamies);
 const r=await send(P,`requestMint(${n}) · encrypted payment of ${n*20} cZAMA`,()=>w.z.requestMint(n));
 const ev=r.logs.map(l=>{try{return zr.interface.parseLog(l)}catch{return null}}).find(e=>e&&e.name==='MintRequested');if(!ev)throw new Error('MintRequested not found');
 st('Relayer: KMS threshold decrypt of paid flag…');const d=await publicDecrypt(ev.args.paidHandle,st);
 st(`paid = ${d.clear} · finalizing…`);const f=await send(P,'finalizeMint',()=>w.z.finalizeMint(ev.args.batchId,!!d.clear,d.decryptionProof||d.proof));
 const ids=f.logs.map(l=>{try{return zr.interface.parseLog(l)}catch{return null}}).filter(e=>e&&e.name==='Transfer'&&e.args.to.toLowerCase()===ADDR.toLowerCase()).map(e=>Number(e.args.tokenId));
 ids.forEach(id=>{S.own[id]=Z.ME;S.hist[id]=[{type:'mint',to:Z.ME,p:20,ts:Date.now()}];Z.act('mint',{id,to:Z.ME,p:20})});S.minted+=ids.length;S.next=Math.max(S.next,...ids.map(i=>i+1),S.next);S.mintedBy+=ids.length;S.mine=[...S.mine,...ids];if(S.balKnown)S.bal-=ids.length*20;
 setTimeout(refresh,4000);return ids}
// ---- market
async function act(kind,arg,price){const P=steps({list:'List on Zamies Market',edit:'Update price',cancel:'Cancel listing',cancelAll:'Cancel all listings',buy:'Confidential purchase',offer:'Confidential offer',coff:'Cancel offer',accept:'Accept offer',seal:'Seal & Earn',claim:'Claim Encrypted Balance',sweep:'Burn Pool · burn cheapest listing',checkin:'Relayer Streaks',pub:'Reveal',poke:'Cipherweight · Pulse'}[kind]);
 try{const w=await W();
  if(kind==='pub'){await send(P,`publish(Zamies #${arg}) · permanent, public`,()=>w.z.publish(arg));S.pub[arg]=1;P.add('Fetching the public decryption from the Zama relayer…');try{await loadPublic([arg],true)}catch(_){}P.done(`Zamies #${arg} is revealed. Its art and traits are now public permanently.`)}
  else if(kind==='list'){const ok=await zr.isApprovedForAll(ADDR,A.market);if(!ok)await send(P,'Approve market for your Zamies (once)',()=>w.z.setApprovalForAll(A.market,true));await send(P,`list(Zamies #${arg}, ${price} cZAMA)`,()=>w.m.list(arg,BigInt(Math.round(price*1e6))));P.done(`Listed Zamies #${arg}. It sits in the market contract until sold or cancelled.`)}
  else if(kind==='edit'){await send(P,`updatePrice(Zamies #${arg}, ${price})`,()=>w.m.updatePrice(arg,BigInt(Math.round(price*1e6))));P.done('Price updated')}
  else if(kind==='cancel'){await send(P,`cancel(Zamies #${arg})`,()=>w.m.cancel(arg));P.done(`Zamies #${arg} is back in your wallet`)}
  else if(kind==='cancelAll'){for(const id of arg)await send(P,`cancel(Zamies #${id})`,()=>w.m.cancel(id));P.done('All listings cancelled')}
  else if(kind==='buy'){await ensureOperator(P,w.c,A.market);const r=await send(P,`buy(${arg.map(i=>'Zamies #'+i).join(', ')}) · encrypted cZAMA payment`,()=>w.m.buy(arg));
   const ev=r.logs.map(l=>{try{return mr.interface.parseLog(l)}catch{return null}}).find(e=>e&&e.name==='PurchaseRequested');P.add('Verifying payment with the Zama KMS (only paid / not paid is revealed)');const d=await publicDecrypt(ev.args.paidHandle);
   await send(P,`finalizePurchase · paid=${d.clear}`,()=>w.m.finalizePurchase(ev.args.purchaseId,!!d.clear,d.proof));P.done(d.clear?'Bought! Sealed in Shielded. Decrypt it there.':'Payment check failed (not enough cZAMA?). Listing unlocked, nothing moved.');S.balKnown=false}
  else if(kind==='offer'){await ensureOperator(P,w.c,A.market);const r=await send(P,`makeOffer(Zamies #${arg}, ${price} cZAMA) · encrypted escrow`,()=>w.m.makeOffer(arg,BigInt(Math.round(price*1e6))));
   const ev=r.logs.map(l=>{try{return mr.interface.parseLog(l)}catch{return null}}).find(e=>e&&e.name==='OfferRequested');P.add('Verifying escrow with the Zama KMS (only funded / not funded is revealed)');const d=await publicDecrypt(ev.args.paidHandle);
   await send(P,`finalizeOffer · funded=${d.clear}`,()=>w.m.finalizeOffer(ev.args.offerId,!!d.clear,d.proof));P.done(d.clear?'Offer placed. Your cZAMA is held in escrow, encrypted.':'Not enough cZAMA. Offer closed, nothing kept.');S.balKnown=false}
  else if(kind==='coff'){await send(P,`cancelOffer(${arg})`,()=>w.m.cancelOffer(arg));P.done('Offer cancelled. Escrow returned to you.');S.balKnown=false}
  else if(kind==='accept'){const o=Object.values(S.inOffers).flat().find(x=>x.oid===arg);const tid=o?Object.keys(S.inOffers).find(k=>S.inOffers[k].includes(o)):null;if(tid&&!S.list[tid]){const ok=await zr.isApprovedForAll(ADDR,A.market);if(!ok)await send(P,'Approve market for your Zamies (once)',()=>w.z.setApprovalForAll(A.market,true))}await send(P,`acceptOffer(${arg})`,()=>w.m.acceptOffer(arg));P.done('Offer accepted. cZAMA paid to you, NFT sent to the buyer.');S.balKnown=false}
  else if(kind==='seal'){await send(P,`sealAndEarn(Zamies #${arg}) · FHE random Ciphertext Track`,()=>w.h.sealAndEarn(arg));P.done(`Zamies #${arg} is sealed and now receives a share of market fees. It can no longer be listed on the Zamies market.`)}
  else if(kind==='checkin'){await send(P,'Relayer Streaks · checkIn()',()=>w.s.checkIn());P.done('Check-in recorded. Your Relayer Streak has been updated.')}
  else if(kind==='poke'){await send(P,`Pulse(Zamies #${arg}) · recompute Cipherweight`,()=>w.hx.poke(arg));P.done(`Weight for Zamies #${arg} recalculated.`)}
  else if(kind==='claim'){await send(P,`claim(Zamies #${arg}) · encrypted transfer`,()=>w.h.claim(arg));P.done('Rewards claimed. The amount has been sent to your cZAMA balance.');S.balKnown=false}
  else if(kind==='sweep'){await send(P,`Burn Pool: buy and burn (Zamies #${arg})`,()=>w.m.sweep(arg));P.done(`Zamies #${arg} was bought with the Burn Pool and sent to the dead address. It is permanently out of supply.`)}
  if(kind!=='checkin'&&kind!=='poke')Z.act(kind==='cancelAll'?'cancel':kind==='edit'?'price':kind==='buy'?'sale':kind,{id:Array.isArray(arg)?arg[0]:arg,from:Z.ME,p:price});
 }catch(e){P.fail(err(e))}await refresh()}
// ---- Get cZAMA (real)
function getczPanel(){const lay=document.querySelector('#pg .lay');if(!lay)return;const [c1,c2]=lay.querySelectorAll('.card2');
 c1.innerHTML=`<div class="lab2" style="margin-top:0">Sepolia testnet · real</div><div class="statbar" style="margin:0 0 10px"><div><small>ZAMA test token (plaintext)</small><b id="rz">${(S.zama||0).toLocaleString()}</b></div><div><small>cZAMA (encrypted)</small><b id="rc">${S.balKnown?S.bal:'••••••'}</b> <button class="b g" id="rdc" style="padding:2px 9px;font-size:12px">👁 Decrypt</button></div></div>
 <button class="b" id="rmz" style="width:100%;margin-bottom:8px">1 · Mint 1,000 test ZAMA (free, gas only)</button>
 <div class="row2" style="flex-wrap:nowrap"><input class="inp2" id="ramt" type="number" min="1" value="200"><button class="b" id="rsh">2 · Shield to cZAMA</button></div>
 <p class="sub2" style="font-size:12px;margin-top:8px">Need Sepolia ETH for gas? Use a faucet such as <a href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia" target="_blank" rel="noopener" style="color:var(--y)">Google Cloud ↗</a>. Unshield is available in the Zama App.</p>`;
 c2.querySelector('code').textContent=A.czama;const ul=c2.querySelector('ul');if(ul)ul.lastElementChild.textContent='On Sepolia the buttons on the left are real transactions with Zama test tokens (no real value).';const cp=c2.querySelector('#gcp');if(cp)cp.onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(A.czama);toast('cZAMA (Sepolia) address copied')};c2.querySelector('.lab2').textContent='cZAMA on Sepolia (Zama cZAMAMock, 6 decimals)';
 $('#rdc').onclick=()=>decryptBalance().then(()=>{$('#rc')&&($('#rc').textContent=S.balKnown?S.bal:'••••••')});
 $('#rmz').onclick=async()=>{const P=steps('Mint test ZAMA');try{const w=await W();await send(P,'ZAMAMock.mint(you, 1000)',()=>w.e.mint(ADDR,ethers.parseUnits('1000',18)));P.done('1,000 test ZAMA added. Now shield it.')}catch(e){P.fail(err(e))}await refresh();$('#rz')&&($('#rz').textContent=(S.zama||0).toLocaleString())};
 $('#rsh').onclick=async()=>{const a=Math.floor(+$('#ramt').value||0);if(a<=0)return toast('Enter an amount');if(a>(S.zama||0))return toast('Not enough test ZAMA. Mint some first.');const P=steps(`Shield ${a} ZAMA → cZAMA`);
  try{const w=await W(),amt=ethers.parseUnits(String(a),18);if((await er.allowance(ADDR,A.czama))<amt)await send(P,'approve(cZAMA wrapper)',()=>w.e.approve(A.czama,amt));await send(P,`wrap(you, ${a})`,()=>w.c.wrap(ADDR,amt));S.balKnown=false;P.done(`Shielded ${a} ZAMA to ${a} cZAMA. Your balance is now encrypted.`)}catch(e){P.fail(err(e))}await refresh();$('#rz')&&($('#rz').textContent=(S.zama||0).toLocaleString())}}
async function hiveBal(id){const P=steps('Encrypted Balance · #'+id);try{const w=await W();await send(P,`sync(Zamies #${id}) · refresh ACL`,()=>w.h.sync(id));P.add('Relayer: user decryption (EIP-712)');const h=await hr.pendingOf(id);let v=0n;if(!ZERO.test(h))[v]=await userDecrypt([{handle:h,contractAddress:A.hive}]);S.hbal=S.hbal||{};S.hbal[id]=Number(v)/1e6;P.done(`Unclaimed rewards for Zamies #${id}: ${S.hbal[id]} cZAMA (visible only to you)`)}catch(e){P.fail(err(e))}redraw()}
async function hiveTrack(id){try{toast('Sign the decrypt request in your wallet…');const h=await hr.trackOf(id);const [v]=await userDecrypt([{handle:h,contractAddress:A.hive}]);S.htrk=S.htrk||{};S.htrk[id]=Number(v);redraw()}catch(e){toast('Decrypt failed: '+err(e))}}
window.ZR={hiveBal,hiveTrack,connect,disconnect,refresh,mint,act,decryptSeed,decryptBalance,getczPanel,A};
dispatchEvent(new Event('zr-ready'));
if(Z.REAL){
 if(window.ethereum){ethereum.on&&ethereum.on('accountsChanged',a=>{if(!a.length)return disconnect();localStorage.setItem('zx-addr',a[0]);location.reload()});ethereum.on&&ethereum.on('chainChanged',()=>{_signer=null})}
 refresh();setInterval(refresh,20000);
 if(location.hash.startsWith('#/get-czama'))setTimeout(getczPanel,50);
}
