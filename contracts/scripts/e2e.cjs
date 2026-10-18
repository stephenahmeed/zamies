// Run from the contracts/ folder after `npx hardhat compile`.
// Requires env: ZAMIES_DEPLOYER_KEY (fresh Sepolia-only test wallet). Optional: SEPOLIA_RPC_URL.
if(!process.env.ZAMIES_DEPLOYER_KEY){console.error("Set ZAMIES_DEPLOYER_KEY in your environment (see .env.example)");process.exit(1)}
const RPC=process.env.SEPOLIA_RPC_URL||'https://ethereum-sepolia-rpc.publicnode.com';
const {ethers}=require('ethers');const fs=require('fs');const D=JSON.parse(fs.readFileSync('deploy-v4.json'));
const p=new ethers.JsonRpcProvider(RPC);const w=new ethers.Wallet(process.env.ZAMIES_DEPLOYER_KEY,p);
const z=new ethers.Contract(D.Zamies,JSON.parse(fs.readFileSync('artifacts/contracts/Zamies.sol/Zamies.json')).abi,w);
(async()=>{
 const rnd=ethers.Wallet.createRandom().address;
 try{await z.publish.estimateGas(44,{from:rnd});console.log('NONHOLDER DID NOT REVERT')}catch(e){console.log('nonholder revert:',e.shortMessage||e.reason)}
 if(!await z.published(44)){const t=await z.publish(44);await t.wait();console.log('publish tx',t.hash);D.txs['publish #44 (e2e)']=t.hash;fs.writeFileSync('deploy-v4.json',JSON.stringify(D,null,1))}
 try{await z.publish.estimateGas(44);console.log('REPUBLISH OK?!')}catch(e){console.log('republish revert:',e.shortMessage||e.reason)}
 const h=await z.publicSeedOf(44);console.log('handle',h);
 const {createInstance,SepoliaConfig}=require('@zama-fhe/relayer-sdk/node');
 const inst=await createInstance({...SepoliaConfig,network:RPC});
 const r=await inst.publicDecrypt([h]);console.log('public seed',String(Object.values(r.clearValues||r)[0]));
})().catch(e=>console.log('ERR',e.message));
