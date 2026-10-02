// Point @meddleware/sui-token-client's template patcher at the bytecode wasm as a Vite asset URL.
// Imported by both entries (the standalone app's main.ts and the library entry the dashboard
// embeds), so a deploy works wherever the component runs. The ~343 kB wasm is fetched only at the
// first deploy.
import wasmUrl from '@mysten/move-bytecode-template/web/move_bytecode_template_bg.wasm?url'
import { configureTemplateWasm } from '@meddleware/sui-token-client/template'

configureTemplateWasm(wasmUrl)
