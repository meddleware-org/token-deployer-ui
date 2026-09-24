// v7-safe patch via direct JSON mutation (deserialize -> mutate -> serialize),
// bypassing update_identifiers/update_constants which cannot re-serialize v7.
import { readFileSync } from 'node:fs';
import { bcs } from '@mysten/bcs';
import * as tpl from '@mysten/move-bytecode-template';

const init = tpl.default ?? tpl.init;
try { if (typeof init === 'function') await init(); } catch {}

const orig = new Uint8Array(readFileSync(new URL('../src/move-template/sui_token_template.mv', import.meta.url)));
const json = tpl.deserialize(orig);

// 1) rename identifiers in place (indices preserved => all handle refs stay valid)
const rename = { sui_token_template: 'mycoin', SUI_TOKEN_TEMPLATE: 'MYCOIN' };
json.identifiers = json.identifiers.map((id) => rename[id] ?? id);

// 2) patch constant_pool by matching the known default values
const vec = (s) => Array.from(bcs.string().serialize(s).toBytes()); // uleb len + utf8 bytes (== vector<u8>)
const patchByCurrent = (currentStr, newStr) => {
  const cur = vec(currentStr);
  const c = json.constant_pool.find((k) => JSON.stringify(k.data) === JSON.stringify(cur));
  if (!c) throw new Error('constant not found: ' + currentStr);
  c.data = vec(newStr);
};
// decimals (U8)
json.constant_pool.find((c) => c.type_ === 'U8').data = [6];
patchByCurrent('TEMPLATE_SYMBOL', 'MYC');
patchByCurrent('TEMPLATE_NAME', 'My Coin');
patchByCurrent('TEMPLATE_DESCRIPTION', 'A great coin');
patchByCurrent('TEMPLATE_ICON_URL', 'https://x/y.svg');

const out = new Uint8Array(tpl.serialize(json));
const magic = Buffer.from(out.slice(0, 4)).toString('hex');
console.log('patched bytes=%d magic=%s (orig=%d)', out.length, magic, orig.length);

// re-deserialize the patched module to confirm structural validity
const back = tpl.deserialize(out);
const asStr = (d) => Buffer.from(d.slice(1)).toString('utf8');
console.log('identifiers now include:', back.identifiers.filter((i) => ['mycoin','MYCOIN','sui_token_template','SUI_TOKEN_TEMPLATE'].includes(i)));
console.log('constants now:', back.constant_pool.map((c) => c.type_==='U8'?`u8=${c.data[0]}`:asStr(c.data)));

const ok = magic === 'a11ceb0b'
  && back.identifiers.includes('mycoin') && back.identifiers.includes('MYCOIN')
  && !back.identifiers.includes('sui_token_template') && !back.identifiers.includes('SUI_TOKEN_TEMPLATE')
  && back.constant_pool.some((c) => c.type_==='U8' && c.data[0]===6)
  && ['MYC','My Coin','A great coin','https://x/y.svg'].every((v) => back.constant_pool.some((c)=>c.type_!=='U8'&&asStr(c.data)===v))
  && !back.constant_pool.some((c)=>c.type_!=='U8'&&asStr(c.data).startsWith('TEMPLATE_'));
console.log('\nJSON-MUTATION ROUND-TRIP', ok ? 'PASS ✓' : 'FAIL ✗');
process.exit(ok ? 0 : 1);
