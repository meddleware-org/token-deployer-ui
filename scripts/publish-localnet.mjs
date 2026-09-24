import { readFileSync } from 'node:fs';
import { bcs } from '@mysten/bcs';
import * as tpl from '@mysten/move-bytecode-template';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { requestSuiFromFaucetV2 } from '@mysten/sui/faucet';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { toBase64 } from '@mysten/sui/utils';

const init = tpl.default ?? tpl.init;
try { if (typeof init === 'function') await init(); } catch {}

const client = new SuiJsonRpcClient({ url: 'http://127.0.0.1:9000' });

const orig = new Uint8Array(readFileSync(new URL('../src/move-template/sui_token_template.mv', import.meta.url)));
const json = tpl.deserialize(orig);
const rename = { sui_token_template: 'mycoin', SUI_TOKEN_TEMPLATE: 'MYCOIN' };
json.identifiers = json.identifiers.map((id) => rename[id] ?? id);
const vec = (s) => Array.from(bcs.string().serialize(s).toBytes());
const patch = (cur, nw) => { const c = json.constant_pool.find((k)=>JSON.stringify(k.data)===JSON.stringify(vec(cur))); c.data = vec(nw); };
json.constant_pool.find((c)=>c.type_==='U8').data = [6];
patch('TEMPLATE_SYMBOL','MYC'); patch('TEMPLATE_NAME','My Coin');
patch('TEMPLATE_DESCRIPTION','A great coin'); patch('TEMPLATE_ICON_URL','https://x/y.svg');
const moduleBytes = new Uint8Array(tpl.serialize(json));
console.log('identifiers sorted?', JSON.stringify(json.identifiers) === JSON.stringify([...json.identifiers].sort()));

const kp = new Ed25519Keypair();
const addr = kp.toSuiAddress();
console.log('address:', addr);
await requestSuiFromFaucetV2({ host: 'http://127.0.0.1:9123', recipient: addr });
let bal = '0';
for (let i=0;i<25;i++){ const b = await client.getBalance({ owner: addr }); if (BigInt(b.totalBalance) > 0n){ bal=b.totalBalance; break;} await new Promise(r=>setTimeout(r,1000)); }
console.log('balance:', bal);

const tx = new Transaction();
tx.setSender(addr);
const [upgradeCap] = tx.publish({ modules: [toBase64(moduleBytes)], dependencies: ['0x1', '0x2'] });
tx.transferObjects([upgradeCap], addr);
tx.setGasBudget(500000000);

try {
  const res = await client.signAndExecuteTransaction({ signer: kp, transaction: tx, options: { showEffects: true, showObjectChanges: true } });
  const status = res.effects?.status?.status;
  console.log('\nstatus:', status);
  if (status !== 'success') { console.log('ERR:', JSON.stringify(res.effects?.status)); process.exit(1); }
  for (const c of (res.objectChanges ?? [])) {
    if (c.type==='published') console.log('packageId:', c.packageId);
    if (c.type==='created') console.log('  created:', c.objectType);
  }
  console.log('\nPUBLISH PASS - verifier accepted the in-place patched module');
} catch (e) {
  console.log('\nPUBLISH FAIL:', e.message);
  process.exit(2);
}

