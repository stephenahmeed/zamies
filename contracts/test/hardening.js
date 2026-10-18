// Pre-mainnet hardening: stale-lock timeouts (mint + buy), escrow refunds, bounded sweep (sorted listings), royalty 2%.
const {expect}=require("chai");const {ethers,fhevm,network}=require("hardhat");const D=1000000n;const H=3600;
async function rv(p,msg){let e;try{await p}catch(x){e=x}if(!e)throw new Error("expected revert");if(msg&&!String(e.message).includes(msg))throw new Error("wrong revert: "+e.message.slice(0,200))}
const warp=async s=>{await network.provider.send("evm_increaseTime",[s]);await network.provider.send("evm_mine")};
const pub=async x=>{const r=await fhevm.publicDecrypt([x]);return [r.clearValues[Object.keys(r.clearValues)[0]],r.decryptionProof]};
const ev=async(k,tx,n)=>(await tx.wait()).logs.map(l=>{try{return k.interface.parseLog(l)}catch{return null}}).find(e=>e&&e.name===n).args;
const DEAD="0x000000000000000000000000000000000000dEaD";

describe("Hardening · Zamies mint escrow + stale timeout + royalty",function(){this.timeout(600000);let o,T,a,b,c,z,cz,Z;
 const bal=async w=>{const x=await cz.confidentialBalanceOf(w.address||w);if(x===ethers.ZeroHash)return 0n;return fhevm.userDecryptEuint(5,x,await cz.getAddress(),w)};
 beforeEach(async()=>{[o,T,a,b,c]=await ethers.getSigners();cz=await (await ethers.getContractFactory("MockCZ")).deploy();
  z=await (await ethers.getContractFactory("Zamies")).deploy(await cz.getAddress(),T.address,20n*D,"u/");Z=await z.getAddress();
  await cz.mint(a.address,1000n*D);for(const w of[a,b])await cz.connect(w).setOperator(Z,2n**40n)});
 it("royalty defaults to 2% to treasury (= market treasury share), owner-configurable, capped at 10%",async()=>{
  expect(await z.DEFAULT_ROYALTY_BPS()).to.eq(200n);expect(await z.MAX_ROYALTY_BPS()).to.eq(1000n);
  const [r,amt]=await z.royaltyInfo(1,100n*D);expect(r).to.eq(T.address);expect(amt).to.eq(2n*D);
  await rv(z.connect(a).setRoyalty(a.address,100));await z.setRoyalty(b.address,1000);expect((await z.royaltyInfo(1,10000))[1]).to.eq(1000n);
  await rv(z.setRoyalty(b.address,1001),"bad royalty");await rv(z.setRoyalty(ethers.ZeroAddress,100),"bad royalty");
  await z.setRoyalty(T.address,200);const [r2,a2]=await z.royaltyInfo(1,10000);expect(r2).to.eq(T.address);expect(a2).to.eq(200n)});
 it("mint payment is escrowed until finalize, then forwarded to treasury",async()=>{const e=await ev(z,await z.connect(a).requestMint(2),"MintRequested");
  expect(await bal(a)).to.eq(960n*D);expect(await bal(T)).to.eq(0n);const [cl,pr]=await pub(e.paidHandle);expect(cl).to.eq(true);
  await z.finalizeMint(e.batchId,cl,pr);expect(await bal(T)).to.eq(40n*D);expect(await z.ownerOf(45)).to.eq(a.address);expect(await z.reserved()).to.eq(0n);
  await rv(z.cancelStaleMint(e.batchId),"bad batch")});
 it("stale mint: nobody can cancel before the deadline; after it anyone can, buyer is refunded and supply released",async()=>{
  const e=await ev(z,await z.connect(a).requestMint(3),"MintRequested");expect(await z.reserved()).to.eq(3n);expect(await z.mintedBy(a.address)).to.eq(3n);
  const bt=await z.batches(e.batchId);expect(bt.deadline).to.eq(BigInt((await ethers.provider.getBlock("latest")).timestamp)+3600n);
  await rv(z.connect(c).cancelStaleMint(e.batchId),"not stale yet");await warp(H-60);await rv(z.connect(c).cancelStaleMint(e.batchId),"not stale yet");
  await warp(61);await (await z.connect(c).cancelStaleMint(e.batchId)).wait();
  expect(await bal(a)).to.eq(1000n*D);expect(await bal(T)).to.eq(0n);expect(await z.reserved()).to.eq(0n);expect(await z.mintedBy(a.address)).to.eq(0n);
  const [cl,pr]=await pub(e.paidHandle);await rv(z.finalizeMint(e.batchId,cl,pr),"bad batch");await rv(z.cancelStaleMint(e.batchId),"bad batch");
  await rv(z.cancelStaleMint(999),"bad batch");
  const e2=await ev(z,await z.connect(a).requestMint(10),"MintRequested");const [c2,p2]=await pub(e2.paidHandle);await z.finalizeMint(e2.batchId,c2,p2);expect(await z.mintedBy(a.address)).to.eq(10n)});
 it("unfunded griefer: reservation clears after timeout (wallet limit + supply freed)",async()=>{
  const e=await ev(z,await z.connect(b).requestMint(10),"MintRequested");await rv(z.connect(b).requestMint(1),"wallet limit");
  await warp(H);await z.connect(a).cancelStaleMint(e.batchId);expect(await z.reserved()).to.eq(0n);expect(await z.mintedBy(b.address)).to.eq(0n);expect(await bal(b)).to.eq(0n);
  await z.connect(b).requestMint(1)});
 it("underfunded finalize refunds escrow (0) and releases allowance",async()=>{const e=await ev(z,await z.connect(b).requestMint(1),"MintRequested");const [cl,pr]=await pub(e.paidHandle);expect(cl).to.eq(false);
  await z.finalizeMint(e.batchId,cl,pr);expect(await z.mintedBy(b.address)).to.eq(0n);expect(await z.reserved()).to.eq(0n);expect(await bal(T)).to.eq(0n);await rv(z.cancelStaleMint(e.batchId),"bad batch")});
 it("setPendingTimeout: owner only, bounded 15 min..7 days, existing batches keep their deadline",async()=>{
  await rv(z.connect(a).setPendingTimeout(2*H));await rv(z.setPendingTimeout(14*60),"bad timeout");await rv(z.setPendingTimeout(7*86400+1),"bad timeout");
  const e=await ev(z,await z.connect(a).requestMint(1),"MintRequested");await z.setPendingTimeout(15*60);expect(await z.pendingTimeout()).to.eq(900n);
  await warp(16*60);await rv(z.cancelStaleMint(e.batchId),"not stale yet");await warp(H);await z.cancelStaleMint(e.batchId)});
});

describe("Hardening · MarketV3 stale purchase timeout + escrow refund",function(){this.timeout(600000);let o,T,a,b,c,z,cz,h,m,M;
 const bal=async w=>{const x=await cz.confidentialBalanceOf(w.address||w);if(x===ethers.ZeroHash)return 0n;return fhevm.userDecryptEuint(5,x,await cz.getAddress(),w)};
 beforeEach(async()=>{[o,T,a,b,c]=await ethers.getSigners();cz=await (await ethers.getContractFactory("MockCZ")).deploy();
  z=await (await ethers.getContractFactory("Zamies")).deploy(await cz.getAddress(),T.address,20n*D,"u/");
  h=await (await ethers.getContractFactory("ZamiesHive")).deploy(await z.getAddress(),await cz.getAddress());
  m=await (await ethers.getContractFactory("ZamiesMarketV3")).deploy(await z.getAddress(),await cz.getAddress(),T.address,await h.getAddress());M=await m.getAddress();await h.setMarket(M);
  await z.teamMint(a.address,4);for(const w of[a,b,c]){await cz.connect(w).setOperator(M,2n**40n);await z.connect(w).setApprovalForAll(M,true)}await cz.mint(b.address,1000n*D);
  await m.setTradingOpen(true);await m.connect(a).list(1,10n*D);await m.connect(a).list(2,20n*D)});
 it("stale purchase: locked until deadline, then anyone cancels; listings unlock and buyer is refunded",async()=>{
  const e=await ev(m,await m.connect(b).buy([1,2]),"PurchaseRequested");expect(await bal(b)).to.eq(970n*D);expect((await m.listings(1)).locked).to.eq(true);
  await rv(m.connect(a).cancel(1),"cannot cancel");await rv(m.connect(a).updatePrice(2,1n),"cannot update");
  const g=await m.getPurchase(e.purchaseId);expect(g.buyer).to.eq(b.address);expect(g.ids.map(Number)).to.deep.eq([1,2]);expect(g.done).to.eq(false);
  await rv(m.connect(c).cancelStalePurchase(e.purchaseId),"not stale yet");await warp(H);
  await (await m.connect(c).cancelStalePurchase(e.purchaseId)).wait();expect(await bal(b)).to.eq(1000n*D);
  expect((await m.listings(1)).locked).to.eq(false);expect((await m.listings(2)).locked).to.eq(false);expect((await m.getPurchase(e.purchaseId)).done).to.eq(true);
  const [cl,pr]=await pub(e.paidHandle);await rv(m.finalizePurchase(e.purchaseId,cl,pr),"bad purchase");await rv(m.cancelStalePurchase(e.purchaseId),"bad purchase");await rv(m.cancelStalePurchase(77),"bad purchase");
  await m.connect(a).cancel(1);expect(await z.ownerOf(1)).to.eq(a.address);
  const e2=await ev(m,await m.connect(b).buy([2]),"PurchaseRequested");const [c2,p2]=await pub(e2.paidHandle);await m.finalizePurchase(e2.purchaseId,c2,p2);expect(await z.ownerOf(2)).to.eq(b.address);expect(await bal(b)).to.eq(980n*D)});
 it("unfunded griefer: lock clears after timeout and the real buyer can buy",async()=>{const e=await ev(m,await m.connect(c).buy([1]),"PurchaseRequested");await rv(m.connect(b).buy([1]),"unavailable");
  await warp(H);await m.connect(a).cancelStalePurchase(e.purchaseId);expect(await bal(c)).to.eq(0n);
  const e2=await ev(m,await m.connect(b).buy([1]),"PurchaseRequested");const [cl,pr]=await pub(e2.paidHandle);await m.finalizePurchase(e2.purchaseId,cl,pr);expect(await z.ownerOf(1)).to.eq(b.address)});
 it("a late but valid finalize still settles if nobody cancelled",async()=>{const e=await ev(m,await m.connect(b).buy([1]),"PurchaseRequested");await warp(3*H);const [cl,pr]=await pub(e.paidHandle);await m.finalizePurchase(e.purchaseId,cl,pr);
  expect(await z.ownerOf(1)).to.eq(b.address);await rv(m.cancelStalePurchase(e.purchaseId),"bad purchase")});
 it("setPendingTimeout: owner only, bounded, deadline fixed per purchase",async()=>{await rv(m.connect(a).setPendingTimeout(2*H));await rv(m.setPendingTimeout(60),"bad timeout");await rv(m.setPendingTimeout(8*86400),"bad timeout");
  await m.setPendingTimeout(2*H);const e=await ev(m,await m.connect(b).buy([1]),"PurchaseRequested");await m.setPendingTimeout(15*60);
  await warp(H+60);await rv(m.cancelStalePurchase(e.purchaseId),"not stale yet");await warp(H);await m.cancelStalePurchase(e.purchaseId);expect(await bal(b)).to.eq(1000n*D)});
});

describe("Hardening · sorted listings + bounded sweep",function(){this.timeout(600000);let o,T,a,b,c,n,cz,h,m,M;
 const order=async()=>{const r=[];let x=await m.firstListed();while(x!==0n){r.push(Number(x));x=await m.nextListed(x)}return r};
 const sortedOk=async()=>{const ids=await order();expect(ids.length).to.eq(Number(await m.listedCount()));let last=0n;for(const id of ids){const p=(await m.listings(id)).price;expect(p>=last).to.eq(true);last=p}return ids};
 beforeEach(async()=>{[o,T,a,b,c]=await ethers.getSigners();cz=await (await ethers.getContractFactory("MockCZ")).deploy();
  n=await (await ethers.getContractFactory("MockNFT")).deploy(T.address);
  h=await (await ethers.getContractFactory("ZamiesHive")).deploy(await n.getAddress(),await cz.getAddress());
  m=await (await ethers.getContractFactory("ZamiesMarketV3")).deploy(await n.getAddress(),await cz.getAddress(),T.address,await h.getAddress());M=await m.getAddress();await h.setMarket(M);
  for(let i=1;i<=120;i++)await n.mint(i<=100?a.address:b.address,i);
  for(const w of[a,b,c]){await cz.mint(w.address,10000n*D);await cz.connect(w).setOperator(M,2n**40n);await n.connect(w).setApprovalForAll(M,true)}await m.setTradingOpen(true)});
 it("list / updatePrice / cancel / sale keep the list sorted; hints work",async()=>{
  const P=[50,10,30,10,70,20,60,40];for(let i=0;i<P.length;i++)await m.connect(a).list(i+1,BigInt(P[i])*D);
  expect(await sortedOk()).to.deep.eq([2,4,6,3,8,1,7,5]); // ties keep listing order
  await m.connect(a).updatePrice(5,5n*D);await m.connect(a).updatePrice(2,45n*D);expect(await sortedOk()).to.deep.eq([5,4,6,3,8,2,1,7]);
  await m.connect(a).cancel(3);await m.connect(a).cancel(5);expect(await sortedOk()).to.deep.eq([4,6,8,2,1,7]);
  const e=await ev(m,await m.connect(b).buy([7,4]),"PurchaseRequested");const [cl,pr]=await pub(e.paidHandle);await m.finalizePurchase(e.purchaseId,cl,pr);expect(await sortedOk()).to.deep.eq([6,8,2,1]);
  const hint=await m.findInsertHint(42n*D);expect(hint).to.eq(8n);await m.connect(a).listWithHint(9,42n*D,hint);expect(await sortedOk()).to.deep.eq([6,8,9,2,1]);
  await m.connect(a).listWithHint(10,1n*D,1);expect((await order())[0]).to.eq(10); // bad hint (priced above) falls back to head
  await m.connect(a).listWithHint(11,46n*D,10);await m.connect(a).listWithHint(12,47n*D,9999);await m.connect(a).updatePriceWithHint(6,100n*D,await m.findInsertHint(100n*D));
  expect(await sortedOk()).to.deep.eq([10,8,9,2,11,12,1,6]);await rv(m.connect(a).list(0,1n),"id")});
 it("insert walk is bounded: deep insert without hint reverts, with findInsertHint works",async()=>{
  for(let i=1;i<=64;i++)await m.connect(a).list(i,BigInt(i)*D);for(let i=65;i<=70;i++)await m.connect(a).listWithHint(i,BigInt(i)*D,await m.findInsertHint(BigInt(i)*D));await rv(m.connect(a).list(71,1000n*D),"use a closer hint");
  await m.connect(a).listWithHint(71,1000n*D,await m.findInsertHint(1000n*D));await m.connect(a).list(72,1n);const ids=await sortedOk();expect(ids[0]).to.eq(72);expect(ids.at(-1)).to.eq(71)});
 it("sweep cost does not grow with the number of listings",async()=>{
  await m.connect(a).list(100,1000n*D);const e0=await ev(m,await m.connect(c).buy([100]),"PurchaseRequested");const [c0,p0]=await pub(e0.paidHandle);await m.finalizePurchase(e0.purchaseId,c0,p0); // gateway 5
  await m.connect(a).list(1,1n*D);await m.connect(a).list(2,1n*D);const g1=(await (await m.connect(c).sweep(1)).wait()).gasUsed;
  for(let i=3;i<=90;i++)await m.connect(a).listWithHint(i,BigInt(10+i)*D,await m.findInsertHint(BigInt(10+i)*D));
  await m.connect(a).list(91,1n*D);await m.connect(a).list(92,15n*D/10n);const g2=(await (await m.connect(c).sweep(2)).wait()).gasUsed;console.log("      sweep gas with 2 vs 90 listings:",g1.toString(),g2.toString());
  expect(g2<g1*11n/10n).to.eq(true);expect(await n.ownerOf(2)).to.eq(DEAD);await rv(m.sweep(92),"not cheapest");await m.sweep(91);expect(await m.cubesBurned()).to.eq(3n)});
 it("sweep skips locked floor listings (bounded) and recovers after the stale lock is cleared",async()=>{
  await m.connect(a).list(100,1000n*D);const e0=await ev(m,await m.connect(c).buy([100]),"PurchaseRequested");const [c0,p0]=await pub(e0.paidHandle);await m.finalizePurchase(e0.purchaseId,c0,p0); // gateway 5
  for(let i=1;i<=33;i++)await m.connect(a).list(i,1n*D);await m.connect(a).list(50,2n*D);
  const pids=[];for(let k=0;k<4;k++){const ids=[];for(let i=k*10+1;i<=Math.min(33,k*10+10);i++)ids.push(i);pids.push((await ev(m,await m.connect(b).buy(ids),"PurchaseRequested")).purchaseId)}
  await rv(m.sweep(50),"too many locked listings");expect(await m.cheapestOpen()).to.eq(50n);
  await warp(H);for(const p of pids)await m.connect(c).cancelStalePurchase(p);
  await rv(m.sweep(50),"not cheapest");await m.sweep(1);expect(await n.ownerOf(1)).to.eq(DEAD);
  // 32 locked at the floor is still fine
  const ids=[];for(let i=2;i<=33;i++)ids.push(i);for(let k=0;k<ids.length;k+=10)await m.connect(b).buy(ids.slice(k,k+10));await m.sweep(50);expect(await n.ownerOf(50)).to.eq(DEAD)});
 it("ties at the floor: any of them can be swept",async()=>{await m.connect(a).list(100,1000n*D);const e0=await ev(m,await m.connect(c).buy([100]),"PurchaseRequested");const [c0,p0]=await pub(e0.paidHandle);await m.finalizePurchase(e0.purchaseId,c0,p0);
  await m.connect(a).list(1,1n*D);await m.connect(a).list(2,1n*D);await m.connect(a).list(3,2n*D);await m.sweep(2);await rv(m.sweep(3),"not cheapest");await m.sweep(1);await sortedOk()});
});
