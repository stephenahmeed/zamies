const {expect}=require("chai");const hre=require("hardhat");const {ethers,fhevm}=hre;const D=1000000n;
async function bal(t,who){const h=await t.confidentialBalanceOf(who.address);if(h===ethers.ZeroHash)return 0n;return fhevm.userDecryptEuint(0? 0:5,h,await t.getAddress(),who);}
async function rv(p,msg){let e;try{await p}catch(x){e=x}if(!e)throw new Error("expected revert");if(msg&&!String(e.message).includes(msg))throw new Error("wrong revert: "+e.message.slice(0,200))}
describe("ZamiesMarketV2",function(){this.timeout(300000);let o,s,b,c,r,nft,cz,m,M;
 async function pub(h){const res=await fhevm.publicDecrypt([h]);const k=Object.keys(res.clearValues)[0];return [res.clearValues[k],res.decryptionProof];}
 async function ev(tx,name){const rc=await tx.wait();return rc.logs.map(l=>{try{return m.interface.parseLog(l)}catch{return null}}).find(e=>e&&e.name===name).args}
 beforeEach(async()=>{[o,s,b,c,r]=await ethers.getSigners();nft=await (await ethers.getContractFactory("MockNFT")).deploy(r.address);cz=await (await ethers.getContractFactory("MockCZ")).deploy();
  m=await (await ethers.getContractFactory("ZamiesMarketV2")).deploy(await nft.getAddress(),await cz.getAddress(),o.address);M=await m.getAddress();
  await nft.mint(s.address,1);await nft.mint(s.address,2);await cz.mint(b.address,100n*D);await cz.mint(c.address,5n*D);
  for(const w of[b,c])await cz.connect(w).setOperator(M,2n**40n);await nft.connect(s).setApprovalForAll(M,true);});
 it("fee defaults to 0, trading locked until mint-out",async()=>{expect(await m.feeBps()).to.eq(0n);expect(await m.tradingOpen()).to.eq(false);await nft.setCounts(4400,44);expect(await m.tradingOpen()).to.eq(true);});
 it("list/update/cancel work while locked; buy reverts",async()=>{await m.connect(s).list(1,10n*D);await m.connect(s).updatePrice(1,12n*D);await rv(m.connect(b).buy([1]),"not available yet");await m.connect(s).cancel(1);expect(await nft.ownerOf(1)).to.eq(s.address);});
 it("buy after mint-out pays seller 96% and royalty 4%",async()=>{await m.connect(s).list(1,10n*D);await nft.setCounts(4400,44);const a=await ev(await m.connect(b).buy([1]),"PurchaseRequested");const [cl,pr]=await pub(a.paidHandle);expect(cl).to.eq(true);await m.finalizePurchase(a.purchaseId,cl,pr);
  expect(await nft.ownerOf(1)).to.eq(b.address);expect(await bal(cz,s)).to.eq(96n*D/10n);expect(await bal(cz,r)).to.eq(4n*D/10n);expect(await bal(cz,b)).to.eq(90n*D);});
 it("owner setTradingOpen overrides; only owner",async()=>{await rv(m.connect(b).setTradingOpen(true));await m.setTradingOpen(true);expect(await m.tradingOpen()).to.eq(true);});
 it("offer while locked escrows; accept locked; accept after open settles",async()=>{const a=await ev(await m.connect(b).makeOffer(2,20n*D),"OfferRequested");const [cl,pr]=await pub(a.paidHandle);expect(cl).to.eq(true);await m.finalizeOffer(a.offerId,cl,pr);
  expect(await bal(cz,b)).to.eq(80n*D);await rv(m.connect(s).acceptOffer(a.offerId),"not available yet");await m.setTradingOpen(true);await m.connect(s).acceptOffer(a.offerId);
  expect(await nft.ownerOf(2)).to.eq(b.address);expect(await bal(cz,s)).to.eq(192n*D/10n);expect(await bal(cz,r)).to.eq(8n*D/10n);await rv(m.connect(b).cancelOffer(a.offerId));});
 it("accept offer on listed item by seller",async()=>{await m.connect(s).list(1,50n*D);const a=await ev(await m.connect(b).makeOffer(1,10n*D),"OfferRequested");const [cl,pr]=await pub(a.paidHandle);await m.finalizeOffer(a.offerId,cl,pr);await m.setTradingOpen(true);
  await rv(m.connect(c).acceptOffer(a.offerId),"not seller");await m.connect(s).acceptOffer(a.offerId);expect(await nft.ownerOf(1)).to.eq(b.address);expect((await m.listings(1)).seller).to.eq(ethers.ZeroAddress);});
 it("cancel offer refunds escrow",async()=>{const a=await ev(await m.connect(b).makeOffer(2,30n*D),"OfferRequested");const [cl,pr]=await pub(a.paidHandle);await m.finalizeOffer(a.offerId,cl,pr);expect(await bal(cz,b)).to.eq(70n*D);
  await rv(m.connect(c).cancelOffer(a.offerId),"cannot cancel");await m.connect(b).cancelOffer(a.offerId);expect(await bal(cz,b)).to.eq(100n*D);});
 it("underfunded offer is closed, nothing moves, cannot be accepted",async()=>{const a=await ev(await m.connect(c).makeOffer(2,50n*D),"OfferRequested");const [cl,pr]=await pub(a.paidHandle);expect(cl).to.eq(false);await m.finalizeOffer(a.offerId,cl,pr);
  expect(await bal(cz,c)).to.eq(5n*D);await m.setTradingOpen(true);await rv(m.connect(s).acceptOffer(a.offerId),"offer not active");expect(await nft.ownerOf(2)).to.eq(s.address);});
 it("forged finalize proof rejected",async()=>{const a=await ev(await m.connect(c).makeOffer(2,50n*D),"OfferRequested");const [,pr]=await pub(a.paidHandle);await rv(m.finalizeOffer(a.offerId,true,pr));});
 it("underfunded buy unlocks listing",async()=>{await m.connect(s).list(1,10n*D);await m.setTradingOpen(true);const a=await ev(await m.connect(c).buy([1]),"PurchaseRequested");const [cl,pr]=await pub(a.paidHandle);expect(cl).to.eq(false);await m.finalizePurchase(a.purchaseId,cl,pr);expect((await m.listings(1)).locked).to.eq(false);await m.connect(s).cancel(1);});
 it("cannot offer on own item",async()=>{await rv(m.connect(s).makeOffer(1,1n),"own item");});
});
