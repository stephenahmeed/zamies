const {expect}=require("chai");const {ethers,network}=require("hardhat");const D=1000000n;
async function rv(p,msg){let e;try{await p}catch(x){e=x}if(!e)throw new Error("expected revert");if(msg&&!String(e.message).includes(msg))throw new Error("wrong revert: "+e.message.slice(0,200))}
const warp=async s=>{await network.provider.send("evm_increaseTime",[s]);await network.provider.send("evm_mine")};const H=3600;
describe("Relayer Streaks + Cipherweight",function(){this.timeout(600000);let o,T,a,b,c,z,cz,h,S,R;
 beforeEach(async()=>{[o,T,a,b,c]=await ethers.getSigners();cz=await (await ethers.getContractFactory("MockCZ")).deploy();
  z=await (await ethers.getContractFactory("Zamies")).deploy(await cz.getAddress(),T.address,20n*D,"u/");
  h=await (await ethers.getContractFactory("ZamiesHive")).deploy(await z.getAddress(),await cz.getAddress());
  S=await (await ethers.getContractFactory("RelayerStreaks")).deploy(await z.getAddress(),T.address);
  R=await (await ethers.getContractFactory("CipherweightRegistry")).deploy(await z.getAddress(),await S.getAddress(),3,3,T.address);
  await z.teamMint(a.address,3);await z.teamMint(b.address,1); // a:1-3 b:4
 });
 it("checkIn: holders only, grows, too soon, resets after 48h, best kept",async()=>{await rv(S.connect(c).checkIn(),"no zamies");
  expect(await S.streakOf(b.address)).to.eq(0n);await S.connect(b).checkIn();expect(await S.streakOf(b.address)).to.eq(1n);
  await rv(S.connect(b).checkIn(),"too soon");await warp(19*H);await rv(S.connect(b).checkIn(),"too soon");
  await warp(1*H);await S.connect(b).checkIn();expect(await S.streakOf(b.address)).to.eq(2n);
  await warp(47*H);await S.connect(b).checkIn();expect(await S.streakOf(b.address)).to.eq(3n);expect(await S.bestStreakOf(b.address)).to.eq(3n);
  await warp(49*H);expect(await S.streakOf(b.address)).to.eq(0n);await S.connect(b).checkIn();expect(await S.streakOf(b.address)).to.eq(1n);expect(await S.bestStreakOf(b.address)).to.eq(3n);
  expect((await S.lastCheckInOf(b.address))>0n).to.eq(true);expect(await S.owner()).to.eq(T.address)});
 it("Cipherweight via balance>=3 or streak>=3; owner thresholds + freeze",async()=>{expect(await R.isQueenHolder(a.address)).to.eq(true);expect(await R.isQueenHolder(b.address)).to.eq(false);
  for(let i=0;i<3;i++){await S.connect(b).checkIn();await warp(21*H)}expect(await R.isQueenHolder(b.address)).to.eq(true);
  await warp(48*H);expect(await R.isQueenHolder(b.address)).to.eq(false);
  await rv(R.connect(a).setThresholds(1,1));await R.connect(T).setThresholds(1,0);expect(await R.isQueenHolder(b.address)).to.eq(true);
  await R.connect(T).freeze();await rv(R.connect(T).setThresholds(3,3),"frozen")});
 it("Hive link: seal at 100, poke upgrades to 125 once Cipherweight, downgrades after",async()=>{await h.connect(b).sealAndEarn(4);expect(await h.weightOf(4)).to.eq(100n);
  await h.setQueenRegistry(await R.getAddress());await h.poke(4);expect(await h.weightOf(4)).to.eq(100n);
  for(let i=0;i<3;i++){await S.connect(b).checkIn();await warp(21*H)}await h.poke(4);expect(await h.weightOf(4)).to.eq(125n);expect(await h.totalWeight()).to.eq(125n);
  await h.connect(a).sealAndEarn(1);expect(await h.weightOf(1)).to.eq(125n);
  await warp(49*H);await h.poke(4);expect(await h.weightOf(4)).to.eq(100n);expect(await h.totalWeight()).to.eq(225n)});
});
