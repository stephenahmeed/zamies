const {expect}=require("chai");const {ethers,fhevm}=require("hardhat");const D=1000000n;
async function rv(p,msg){let e;try{await p}catch(x){e=x}if(!e)throw new Error("expected revert");if(msg&&!String(e.message).includes(msg))throw new Error("wrong revert: "+e.message.slice(0,200))}
async function bal(t,w){const h=await t.confidentialBalanceOf(w.address);if(h===ethers.ZeroHash)return 0n;return fhevm.userDecryptEuint(5,h,await t.getAddress(),w)}
describe("Zamies v2 NFT + market",function(){this.timeout(300000);let o,t,u,v,z,cz,m,M;
 const pub=async h=>{const r=await fhevm.publicDecrypt([h]);return [r.clearValues[Object.keys(r.clearValues)[0]],r.decryptionProof]};
 const ev=async(c,tx,n)=>(await tx.wait()).logs.map(l=>{try{return c.interface.parseLog(l)}catch{return null}}).find(e=>e&&e.name===n).args;
 beforeEach(async()=>{[o,t,u,v]=await ethers.getSigners();cz=await (await ethers.getContractFactory("MockCZ")).deploy();
  z=await (await ethers.getContractFactory("Zamies")).deploy(await cz.getAddress(),t.address,20n*D,"https://x/");
  m=await (await ethers.getContractFactory("ZamiesMarketV2")).deploy(await z.getAddress(),await cz.getAddress(),t.address);M=await m.getAddress();
  await cz.mint(u.address,1000n*D);await cz.connect(u).setOperator(await z.getAddress(),2n**40n);await cz.connect(u).setOperator(M,2n**40n);});
 it("treasury + royalty to treasury, setters owner-only",async()=>{expect(await z.treasury()).to.eq(t.address);const [r,a]=await z.royaltyInfo(1,10000);expect(r).to.eq(t.address);expect(a).to.eq(200n);
  await rv(z.connect(u).setTreasury(u.address));await rv(z.connect(u).setRoyalty(u.address,400));await z.setTreasury(v.address);await z.setRoyalty(v.address,400);expect(await z.treasury()).to.eq(v.address);expect((await z.royaltyInfo(1,10000))[0]).to.eq(v.address);
  await rv(z.setRoyalty(v.address,2000),"bad royalty");await rv(z.setTreasury(ethers.ZeroAddress),"zero address")});
 it("team mint 44 to team, capped",async()=>{for(let i=0;i<11;i++)await z.teamMint(t.address,4);expect(await z.teamMinted()).to.eq(44n);expect(await z.ownerOf(1)).to.eq(t.address);expect(await z.ownerOf(44)).to.eq(t.address);await rv(z.teamMint(t.address,1),"reserve used")});
 it("public mint pays treasury 20 cZAMA each, gets #45",async()=>{await z.teamMint(t.address,44);const a=await ev(z,await z.connect(u).requestMint(2),"MintRequested");const [c,p]=await pub(a.paidHandle);await z.finalizeMint(a.batchId,c,p);
  expect(await z.ownerOf(45)).to.eq(u.address);expect(await z.ownerOf(46)).to.eq(u.address);expect(await bal(cz,t)).to.eq(40n*D);await rv(z.connect(u).requestMint(9),"wallet limit")});
 it("market on new NFT: locked, royalty to treasury after open",async()=>{await z.teamMint(t.address,44);await z.connect(t).setApprovalForAll(M,true);await m.connect(t).list(1,100n*D);expect(await m.tradingOpen()).to.eq(false);await rv(m.connect(u).buy([1]),"not available yet");
  await m.setTradingOpen(true);const a=await ev(m,await m.connect(u).buy([1]),"PurchaseRequested");const [c,p]=await pub(a.paidHandle);await m.finalizePurchase(a.purchaseId,c,p);expect(await z.ownerOf(1)).to.eq(u.address);expect(await bal(cz,t)).to.eq(100n*D)});
});
