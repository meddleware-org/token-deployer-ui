// End-to-end: patch -> publish (fee + immutable) -> finalize (mint + fixed supply
// + frozen metadata) against localnet, using the actual app lib.
import init from '@mysten/move-bytecode-template';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { requestSuiFromFaucetV2 } from '@mysten/sui/faucet';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { patchTemplateModule } from '../src/lib/template.ts';
import { buildPublishTransaction, buildFinalizeTransaction, extractPublishResult, needsFinalize } from '../src/lib/buildPublishTx.ts';

await (init)();
const client = new SuiJsonRpcClient({ url: 'http://127.0.0.1:9000' });
const kp = new Ed25519Keypair(); const sender = kp.toSuiAddress();
const feeRecipient = new Ed25519Keypair().toSuiAddress();
await requestSuiFromFaucetV2({ host: 'http://127.0.0.1:9123', recipient: sender });
for (let i=0;i<25;i++){ const b=await client.getBalance({owner:sender}); if(BigInt(b.totalBalance)>0n)break; await new Promise(r=>setTimeout(r,1000)); }

const config = {
  packageName:'fixed_token', moduleName:'fixedtok', structName:'FIXEDTOK',
  symbol:'FIX', name:'Fixed Token', description:'Fixed supply token', iconUrl:'', decimals:6,
  initialSupply: 1000n, supplyPolicy:'fixed', metadataPolicy:'frozen', packagePolicy:'immutable',
  recipient: sender, license:'MIT', packageDescription:'', projectName:'',
};

const moduleBytes = await patchTemplateModule(config);
const feeMist = 250000000n;
const pubTx = buildPublishTransaction({ moduleBytes, sender, feeMist, feeRecipient, gasBudget: 500000000n, packagePolicy: config.packagePolicy });
const pub = await client.signAndExecuteTransaction({ signer: kp, transaction: pubTx, options: { showEffects:true, showObjectChanges:true, showBalanceChanges:true } });
console.log('publish status:', pub.effects?.status?.status);
if (pub.effects?.status?.status !== 'success') { console.log(JSON.stringify(pub.effects?.status)); process.exit(1); }

await client.waitForTransaction({ digest: pub.digest });

const result = extractPublishResult(pub.objectChanges ?? [], { network:'localnet', digest: pub.digest, feeRecipient, feeMist });
console.log('coinType:', result.coinType);
console.log('caps:', { t: !!result.treasuryCapId, m: !!result.metadataCapId, upgrade: result.upgradeCapId ?? '(burned=immutable)' });

// fee arrived?
const feeBal = await client.getBalance({ owner: feeRecipient });
console.log('fee recipient balance:', feeBal.totalBalance, feeBal.totalBalance === feeMist.toString() ? 'OK' : 'MISMATCH');

// finalize
console.log('needsFinalize:', needsFinalize(config, sender));
const finTx = buildFinalizeTransaction({ config, coinType: result.coinType, treasuryCapId: result.treasuryCapId, metadataCapId: result.metadataCapId, sender, gasBudget: 500000000n });
const fin = await client.signAndExecuteTransaction({ signer: kp, transaction: finTx, options: { showEffects:true, showObjectChanges:true } });
await client.waitForTransaction({ digest: fin.digest });
console.log('finalize status:', fin.effects?.status?.status);
if (fin.effects?.status?.status !== 'success') { console.log(JSON.stringify(fin.effects?.status)); process.exit(1); }

// minted coin present?
const coins = await client.getCoins({ owner: sender, coinType: result.coinType });
const total = coins.data.reduce((a,c)=>a+BigInt(c.balance), 0n);
const expected = 1000n * 10n**6n;
console.log('minted balance:', total.toString(), total===expected ? 'OK (1000 * 10^6)' : 'MISMATCH exp '+expected);

// treasury cap frozen (immutable owner)?
const tcap = await client.getObject({ id: result.treasuryCapId, options:{ showOwner:true } });
const owner = tcap.data?.owner ?? tcap.object?.owner ?? tcap.owner;
console.log('treasuryCap owner after fixed-supply freeze:', JSON.stringify(owner));

const ok = result.coinType.endsWith('::fixedtok::FIXEDTOK')
  && feeBal.totalBalance === feeMist.toString()
  && !result.upgradeCapId
  && total === expected;
console.log('\nE2E', ok ? 'PASS ✓' : 'FAIL ✗');
process.exit(ok ? 0 : 1);
