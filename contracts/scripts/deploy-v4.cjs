// Run from the contracts/ folder after `npx hardhat compile`.
// Requires env: ZAMIES_DEPLOYER_KEY (fresh Sepolia-only test wallet). Optional: SEPOLIA_RPC_URL.
if(!process.env.ZAMIES_DEPLOYER_KEY){console.error("Set ZAMIES_DEPLOYER_KEY in your environment (see .env.example)");process.exit(1)}
const RPC=process.env.SEPOLIA_RPC_URL||'https://ethereum-sepolia-rpc.publicnode.com';
const {ethers}=require('ethers');const fs=require('fs');
const p=new ethers.JsonRpcProvider(RPC);const w=new ethers.Wallet(process.env.ZAMIES_DEPLOYER_KEY,p);
const art=(f,n)=>JSON.parse(fs.readFileSync(`artifacts/contracts/${f}/${n}.json`));
const CZ='0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB',TR=w.address;const out={txs:{}};const save=()=>fs.writeFileSync('deploy-v4.json',JSON.stringify(out,null,1));
const dep=async(f,n,args)=>{const a=art(f,n);const c=await new ethers.ContractFactory(a.abi,a.bytecode,w).deploy(...args);await c.waitForDeployment();out[n]=await c.getAddress();out.txs['deploy '+n]=c.deploymentTransaction().hash;save();console.log(n,out[n]);return c};
const tx=async(k,pr)=>{const t=await pr;await t.wait();out.txs[k]=t.hash;save();console.log(k,t.hash)};
(async()=>{
const z=await dep('Zamies.sol','Zamies',[CZ,TR,20000000n,'https://zamies.vercel.app/api/meta/']);
const s=await dep('hive/RelayerStreaks.sol','RelayerStreaks',[out.Zamies,w.address]);
const r=await dep('hive/CipherweightRegistry.sol','CipherweightRegistry',[out.Zamies,out.RelayerStreaks,3,3,w.address]);
const h=await dep('hive/ZamiesHive.sol','ZamiesHive',[out.Zamies,CZ]);
const m=await dep('hive/ZamiesMarketV3.sol','ZamiesMarketV3',[out.Zamies,CZ,TR,out.ZamiesHive]);
await tx('hive.setMarket',h.setMarket(out.ZamiesMarketV3));
await tx('hive.setQueenRegistry',h.setQueenRegistry(out.CipherweightRegistry));
await tx('market.setTradingOpen(true)',m.setTradingOpen(true));
for(let i=0;i<11;i++)await tx('teamMint '+(i*4+4),z.teamMint(w.address,4));
})().catch(e=>{console.log('ERR',e.shortMessage||e.message);process.exit(1)});
