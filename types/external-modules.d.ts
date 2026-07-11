declare module 'pos' {
  type TaggedWord = [word: string, tag: string]

  class Lexer {
    lex(text: string): string[]
  }

  class Tagger {
    tag(words: string[]): TaggedWord[]
  }

  const pos: {
    Lexer: typeof Lexer
    Tagger: typeof Tagger
  }

  export default pos
}

declare module '*.wasm?module' {
  const wasmModule: WebAssembly.Module
  export default wasmModule
}
