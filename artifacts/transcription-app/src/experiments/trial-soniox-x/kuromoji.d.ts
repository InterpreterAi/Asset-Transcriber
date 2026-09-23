declare module "kuromoji" {
  const kuromoji: {
    builder: (opts: { dicPath: string }) => {
      build: (
        cb: (
          err: Error | null,
          tokenizer: {
            tokenize: (text: string) => Array<{ surface_form: string; reading?: string; pos?: string }>;
          },
        ) => void,
      ) => void;
    };
  };
  export default kuromoji;
}

declare module "kuromoji/src/loader/NodeDictionaryLoader.js" {
  class DictionaryLoader {
    constructor(dicPath: string);
    loadArrayBuffer: (url: string, cb: (err: Error | null, buffer: ArrayBuffer | null) => void) => void;
  }
  export default DictionaryLoader;
}

declare module "kuromoji/src/loader/BrowserDictionaryLoader.js" {
  class BrowserDictionaryLoader {
    constructor(dicPath: string);
    loadArrayBuffer: (url: string, cb: (err: Error | null, buffer: ArrayBuffer | null) => void) => void;
  }
  export default BrowserDictionaryLoader;
}

declare module "zlibjs/bin/gunzip.min.js" {
  const zlib: {
    Zlib: { Gunzip: new (data: Uint8Array) => { decompress: () => Uint8Array } };
  };
  export default zlib;
}
