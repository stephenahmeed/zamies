const hre=require("hardhat");
const {expect}=require("chai");const {ethers,fhevm}=require("hardhat");const D=1000000n;
async function rv(p,msg){let e;try{await p}catch(x){e=x}if(!e)throw new Error("expected revert");if(msg&&!String(e.message).includes(msg))throw new Error("wrong revert: "+e.message.slice(0,200))}
const DEAD="0x000000000000000000000000000000000000dEaD";
describe("Hive + MarketV3",function(){this.timeout(600000);let o,T,a,b,c,z,cz,h,m,M,bp,Q;
 const pub=async x=>{const r=await fhevm.publicDecrypt([x]);return [r.clearValues[Object.keys(r.clearValues)[0]],r.decryptionProof]};
 const ev=async(k,tx,n)=>(await tx.wait()).logs.map(l=>{try{return k.interface.parseLog(l)}catch{return null}}).find(e=>e&&e.name===n).args;
 const bal=async(w)=>{const x=await cz.confidentialBalanceOf(w.address||w);if(x===ethers.ZeroHash)return 0n;return fhevm.userDecryptEuint(5,x,await cz.getAddress(),w)};
 const pend=async(id,w)=>fhevm.userDecryptEuint(5,await h.pendingOf(id),await h.getAddress(),w);
 async function sale(seller,buyer,id,price){await m.connect(seller).list(id,price);const e=await ev(m,await m.connect(buyer).buy([id]),"PurchaseRequested");const [cl,pr]=await pub(e.paidHandle);await m.finalizePurchase(e.purchaseId,cl,pr)}
 beforeEach(async()=>{[o,T,a,b,c]=await ethers.getSigners();cz=await (await ethers.getContractFactory("MockCZ")).deploy();
  z=await (await ethers.getContractFactory("Zamies")).deploy(await cz.getAddress(),T.address,20n*D,"u/");
  h=await (await ethers.getContractFactory("ZamiesHive")).deploy(await z.getAddress(),await cz.getAddress());
  m=await (await ethers.getContractFactory("ZamiesMarketV3")).deploy(await z.getAddress(),await cz.getAddress(),T.address,await h.getAddress());M=await m.getAddress();
  await h.setMarket(M);
  await z.teamMint(a.address,2);await z.teamMint(b.address,2);await z.teamMint(c.address,2); // a:1,2 b:3,4 c:5,6
  for(const w of[a,b,c]){await cz.mint(w.address,1000n*D);await cz.connect(w).setOperator(M,2n**40n);await z.connect(w).setApprovalForAll(M,true)}});
 it("split is immutable 2% / 4% / 0.5% Burn Gateway; seller 93.5%; no fee setter",async()=>{expect(m.interface.getFunction("setFee")).to.eq(null);
  await m.setTradingOpen(true);await h.connect(b).sealAndEarn(3);await sale(a,c,1,100n*D);
  expect(await bal(T)).to.eq(2n*D);expect(await bal(a)).to.eq(1000n*D+935n*D/10n);expect(await m.burnGatewayBalance()).to.eq(5n*D/10n);expect(await h.totalDecryptedToHolders()).to.eq(4n*D);expect(await pend(3,b)).to.eq(0n);
  await h.sync(3);expect(await pend(3,b)).to.eq(4n*D)});
 it("trading lock still enforced until mint-out",async()=>{await m.connect(a).list(1,10n*D);await rv(m.connect(b).buy([1]),"not available yet");expect(await m.tradingOpen()).to.eq(false)});
 it("Seal & Earn: owner only, once; blocks list, offers, accept",async()=>{await rv(h.connect(b).sealAndEarn(1),"not owner");await h.connect(a).sealAndEarn(1);await rv(h.connect(a).sealAndEarn(1),"already sealed");
  await rv(m.connect(a).list(1,1n*D),"sealed");await rv(m.connect(b).makeOffer(1,1n*D),"sealed");expect(await h.sealedCount()).to.eq(1n)});
 it("offer made before Seal & Earn cannot be accepted after",async()=>{const e=await ev(m,await m.connect(b).makeOffer(1,5n*D),"OfferRequested");const [cl,pr]=await pub(e.paidHandle);await m.finalizeOffer(e.offerId,cl,pr);
  await h.connect(a).sealAndEarn(1);await m.setTradingOpen(true);await rv(m.connect(a).acceptOffer(e.offerId),"sealed");await m.connect(b).cancelOffer(e.offerId);expect(await bal(b)).to.eq(1000n*D)});
 it("pro-rata rewards across cubes, claim pays owner, counter aggregates",async()=>{await m.setTradingOpen(true);await h.connect(b).sealAndEarn(3);await h.connect(b).sealAndEarn(4);await h.connect(c).sealAndEarn(5);
  await sale(a,c,1,300n*D); // 12 cZAMA pool -> 4 each
  await h.sync(3);await h.sync(5);expect(await pend(3,b)).to.eq(4n*D);expect(await pend(5,c)).to.eq(4n*D);
  const before=await bal(c);await rv(h.connect(b).claim(5),"not owner");await h.connect(c).claim(5);expect(await bal(c)).to.eq(before+4n*D);expect(await pend(5,c)).to.eq(0n);expect(await h.totalDecryptedToHolders()).to.eq(12n*D)});
 it("rewards stick to token across P2P transfer; old owner loses ACL on new handle",async()=>{await m.setTradingOpen(true);await h.connect(b).sealAndEarn(3);await sale(a,c,1,100n*D);
  await z.connect(b).transferFrom(b.address,a.address,3);await h.sync(3);expect(await pend(3,a)).to.eq(4n*D);let err;try{await pend(3,b)}catch(x){err=x}expect(!!err).to.eq(true);
  await rv(h.connect(b).claim(3),"not owner");const x=await bal(a);await h.connect(a).claim(3);expect(await bal(a)).to.eq(x+4n*D)});
 it("rewards before any Seal & Earn are held then credited to first cube",async()=>{await m.setTradingOpen(true);await sale(a,c,1,100n*D);expect(await h.undistributed()).to.eq(4n*D);expect(await h.totalDecryptedToHolders()).to.eq(0n);
  await h.connect(b).sealAndEarn(3);expect(await h.undistributed()).to.eq(0n);await h.sync(3);expect(await pend(3,b)).to.eq(4n*D)});
 it("late Seal & Earn does not earn past rewards",async()=>{await m.setTradingOpen(true);await h.connect(b).sealAndEarn(3);await sale(a,c,1,100n*D);await h.connect(c).sealAndEarn(5);await h.sync(5);expect(await pend(5,c)).to.eq(0n)});
 it("Royal Handle Boost 1.25x weight via one-time registry hook",async()=>{Q=await (await ethers.getContractFactory("MockQueen")).deploy();await rv(h.connect(a).setQueenRegistry(await Q.getAddress()));await h.setQueenRegistry(await Q.getAddress());await rv(h.setQueenRegistry(await Q.getAddress()),"registry set");
  await Q.set(c.address,true);await m.setTradingOpen(true);await h.connect(b).sealAndEarn(3);await h.connect(c).sealAndEarn(5);expect(await h.weightOf(5)).to.eq(125n);
  await sale(a,b,1,450n*D); // pool 18 -> 8 : 10
  await h.sync(3);await h.sync(5);expect(await pend(3,b)).to.eq(8n*D);expect(await pend(5,c)).to.eq(10n*D);
  await Q.set(c.address,false);await h.poke(5);expect(await h.weightOf(5)).to.eq(100n);expect(await pend(5,c)).to.eq(10n*D)});
 it("Ciphertext Track in 0..3, decryptable by owner only",async()=>{await h.connect(a).sealAndEarn(1);const t=await fhevm.userDecryptEuint(2,await h.trackOf(1),await h.getAddress(),a);expect(t<4n).to.eq(true);let e;try{await fhevm.userDecryptEuint(2,await h.trackOf(1),await h.getAddress(),b)}catch(x){e=x}expect(!!e).to.eq(true)});
 it("access control: notify only market, market set once",async()=>{await rv(h.notifyReward(1),"only market");await rv(h.setMarket(a.address),"market set")});
 it("per-token approval cleared by sale (OZ5); listing moves custody",async()=>{await z.connect(a).approve(c.address,2);await m.setTradingOpen(true);await sale(a,b,2,10n*D);expect(await z.getApproved(2)).to.eq(ethers.ZeroAddress);expect(await z.ownerOf(2)).to.eq(b.address)});
 it("offers settle with the same split",async()=>{await m.setTradingOpen(true);await h.connect(c).sealAndEarn(5);const e=await ev(m,await m.connect(b).makeOffer(1,100n*D),"OfferRequested");const [cl,pr]=await pub(e.paidHandle);await m.finalizeOffer(e.offerId,cl,pr);
  await m.connect(a).acceptOffer(e.offerId);expect(await z.ownerOf(1)).to.eq(b.address);expect(await bal(T)).to.eq(2n*D);expect(await h.totalDecryptedToHolders()).to.eq(4n*D);expect(await m.burnGatewayBalance()).to.eq(5n*D/10n);expect(await bal(a)).to.eq(1000n*D+935n*D/10n)});
});
describe("Burn Gateway",function(){this.timeout(600000);let o,T,a,b,c,z,cz,h,m,M;const D=1000000n;
 const pub=async x=>{const r=await fhevm.publicDecrypt([x]);return [r.clearValues[Object.keys(r.clearValues)[0]],r.decryptionProof]};
 const ev=async(k,tx,n)=>(await tx.wait()).logs.map(l=>{try{return k.interface.parseLog(l)}catch{return null}}).find(e=>e&&e.name===n).args;
 const bal=async(w)=>{const x=await cz.confidentialBalanceOf(w.address);if(x===ethers.ZeroHash)return 0n;return fhevm.userDecryptEuint(5,x,await cz.getAddress(),w)};
 async function sale(s,bu,id,p){await m.connect(s).list(id,p);const e=await ev(m,await m.connect(bu).buy([id]),"PurchaseRequested");const [cl,pr]=await pub(e.paidHandle);await m.finalizePurchase(e.purchaseId,cl,pr)}
 beforeEach(async()=>{[o,T,a,b,c]=await ethers.getSigners();cz=await (await ethers.getContractFactory("MockCZ")).deploy();z=await (await ethers.getContractFactory("Zamies")).deploy(await cz.getAddress(),T.address,20n*D,"u/");
  h=await (await ethers.getContractFactory("ZamiesHive")).deploy(await z.getAddress(),await cz.getAddress());m=await (await ethers.getContractFactory("ZamiesMarketV3")).deploy(await z.getAddress(),await cz.getAddress(),T.address,await h.getAddress());M=await m.getAddress();await h.setMarket(M);
  await z.teamMint(a.address,4);await z.teamMint(b.address,4); // a:1-4 b:5-8
  for(const w of[a,b,c]){await cz.mint(w.address,1000n*D);await cz.connect(w).setOperator(M,2n**40n);await z.connect(w).setApprovalForAll(M,true)}
  await m.setTradingOpen(true);await sale(a,c,1,200n*D);await sale(b,c,5,200n*D); // gateway = 2 cZAMA
 });
 it("accrues 0.5% per sale",async()=>{expect(await m.burnGatewayBalance()).to.eq(2n*D);expect(await m.cubesBurned()).to.eq(0n)});
 it("sweep buys the cheapest listing and sends it to the dead address forever",async()=>{await m.connect(a).list(2,15n*D/10n);await m.connect(b).list(6,18n*D/10n);expect(await m.listedCount()).to.eq(2n);
  await rv(m.connect(c).sweep(6),"not cheapest");const before=await bal(a);await m.connect(c).sweep(2);
  expect(await z.ownerOf(2)).to.eq(DEAD);expect(await m.cubesBurned()).to.eq(1n);expect(await m.listedCount()).to.eq(1n);
  expect(await bal(a)).to.eq(before+15n*D/10n*9350n/10000n);expect(await m.burnGatewayBalance()).to.eq(2n*D-15n*D/10n+15n*D/10n*50n/10000n);
  await rv(m.connect(a).list(2,1n),"not owner");await rv(m.connect(c).sweep(2),"unavailable")});
 it("reverts when the gateway balance is too low",async()=>{await m.connect(a).list(2,3n*D);await rv(m.sweep(2),"gateway balance too low")});
 it("respects the trading lock",async()=>{await m.connect(a).list(2,1n*D);await m.setTradingOpen(false);await rv(m.sweep(2),"not available yet")});
 it("skips locked listings and cannot sweep a pending purchase",async()=>{await m.connect(a).list(2,1n*D);await m.connect(b).list(6,15n*D/10n);await m.connect(c).buy([2]);
  await rv(m.sweep(2),"unavailable");await m.sweep(6);expect(await z.ownerOf(6)).to.eq(DEAD)});
 it("listed index stays consistent across cancel / sale / offer accept",async()=>{await m.connect(a).list(2,5n*D);await m.connect(a).list(3,6n*D);await m.connect(b).list(6,7n*D);await m.connect(a).cancel(2);expect(await m.listedCount()).to.eq(2n);
  await sale(a,c,4,10n*D);expect(await m.listedCount()).to.eq(2n);const e=await ev(m,await m.connect(c).makeOffer(3,1n*D),"OfferRequested");const [cl,pr]=await pub(e.paidHandle);await m.finalizeOffer(e.offerId,cl,pr);await m.connect(a).acceptOffer(e.offerId);expect(await m.listedCount()).to.eq(1n);expect(await m.listedAt(0)).to.eq(6n)});
});
describe("gas",function(){this.timeout(300000);it("reports gas",async()=>{const {ethers,fhevm}=require("hardhat");const [o,T,a,b]=await ethers.getSigners();const D=1000000n;
 const cz=await (await ethers.getContractFactory("MockCZ")).deploy();const z=await (await ethers.getContractFactory("Zamies")).deploy(await cz.getAddress(),T.address,20n*D,"u/");
 const h=await (await ethers.getContractFactory("ZamiesHive")).deploy(await z.getAddress(),await cz.getAddress());const m=await (await ethers.getContractFactory("ZamiesMarketV3")).deploy(await z.getAddress(),await cz.getAddress(),T.address,await h.getAddress());
 const g=async(n,tx)=>{const r=await (await tx).wait();console.log("      gas",n,r.gasUsed.toString())};
 await g("deploy hive",h.deploymentTransaction());await g("deploy marketV3",m.deploymentTransaction());await h.setMarket(await m.getAddress());
 await z.teamMint(a.address,3);await g("hardwire",h.connect(a).sealAndEarn(1));await g("sync",h.sync(1));await g("claim",h.connect(a).claim(1));
 await cz.mint(b.address,1000n*D);await cz.connect(b).setOperator(await m.getAddress(),2n**40n);await z.connect(a).setApprovalForAll(await m.getAddress(),true);await m.setTradingOpen(true);
 await g("list",m.connect(a).list(2,10n*D));const r=await (await m.connect(b).buy([2])).wait();console.log("      gas buy",r.gasUsed.toString());const e=r.logs.map(l=>{try{return m.interface.parseLog(l)}catch{return null}}).find(x=>x&&x.name==="PurchaseRequested").args;
 const pd=await fhevm.publicDecrypt([e.paidHandle]);await g("finalizePurchase (6.5% split)",m.finalizePurchase(e.purchaseId,pd.clearValues[Object.keys(pd.clearValues)[0]],pd.decryptionProof));
 for(const n of["ZamiesHive","ZamiesMarketV3"]){const a=await hre.artifacts.readArtifact(n);console.log("      size",n,(a.deployedBytecode.length-2)/2)}})});
