declare module "nspell" {
  interface NSpell {
    correct(word: string): boolean;
    suggest(word: string): string[];
  }
  function nspell(aff: string, dic: string): NSpell;
  export default nspell;
}
