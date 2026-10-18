const {expect}=require("chai");const {ethers,fhevm}=require("hardhat");
async function rv(p,msg){let e;try{await p}catch(x){e=x}if(!e)throw new Error("expected revert");if(msg&&!String(e.message).includes(msg))throw new Error("wrong revert: "+e.message.slice(0,200))}
describe("Publish art",function(){this.timeout(300000);let o,T,a,b,z,cz;
 beforeEach(async()=>{[o,T,a,b]=await ethers.getSigners();cz=await (await ethers.getContractFactory("MockCZ")).deploy();
  z=await (await ethers.getContractFactory("Zamies")).deploy(await cz.getAddress(),T.address,20n*1000000n,"u/");await z.teamMint(a.address,2)});
 it("non-holder cannot publish",async()=>{await rv(z.connect(b).publish(1),"not owner");await rv(z.publish(1),"not owner")});
 it("publish is permanent, publicly decryptable, survives transfer",async()=>{
  await rv(z.publicSeedOf(1),"not published");
  const priv=await z.connect(a).seedOf(1);let err;try{await fhevm.publicDecrypt([priv])}catch(x){err=x}expect(!!err).to.eq(true);
  const mine=await fhevm.userDecryptEuint(5,priv,await z.getAddress(),a);
  await (await z.connect(a).publish(1)).wait();expect(await z.published(1)).to.eq(true);
  await rv(z.connect(a).publish(1),"already published");
  const h=await z.publicSeedOf(1);const r=await fhevm.publicDecrypt([h]);expect(BigInt(Object.values(r.clearValues)[0])).to.eq(mine);
  await z.connect(a).transferFrom(a.address,b.address,1);expect(await z.published(1)).to.eq(true);
  const h2=await z.publicSeedOf(1);const r2=await fhevm.publicDecrypt([h2]);expect(BigInt(Object.values(r2.clearValues)[0])).to.eq(mine);
  expect(await fhevm.userDecryptEuint(5,await z.connect(b).seedOf(1),await z.getAddress(),b)).to.eq(mine);
  await rv(z.connect(a).publish(1),"not owner");await rv(z.connect(b).publish(1),"already published");
  expect(await z.published(2)).to.eq(false)});
});
