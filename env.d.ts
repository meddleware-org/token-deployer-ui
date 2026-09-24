/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

// Raw ?url imports (Vite) for the move-bytecode-template wasm asset.
declare module '*?url' {
  const src: string
  export default src
}
