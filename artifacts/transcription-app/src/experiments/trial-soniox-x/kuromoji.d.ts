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
