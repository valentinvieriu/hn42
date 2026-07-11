/// <reference types="@cloudflare/workers-types" />

declare module "*.wasm?module" {
  const wasmModule: WebAssembly.Module;
  export default wasmModule;
}

declare module "h3" {
  interface H3EventContext {
    cf: CfProperties;
    cloudflare: {
      request: Request;
      env: Env;
      context: ExecutionContext;
    };
  }
}

export {};
