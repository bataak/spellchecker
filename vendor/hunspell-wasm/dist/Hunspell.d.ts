export declare function createHunspellFromFiles(affixesFilePath: string, dictionaryFilePath: string, key?: string): Promise<Hunspell>;
export declare function createHunspellFromStrings(affixes: string, dictionary: string, key?: string): Promise<Hunspell>;
export declare class Hunspell {
    private readonly wasmModule;
    private wasmMemory;
    private hunspellHandle;
    private disposed;
    constructor(wasmModule: any, affixes: string, dictionary: string, key?: string);
    testSpelling(word: string): boolean;
    getSpellingSuggestions(word: string): string[];
    getSuffixSuggestions(word: string): string[];
    analyzeWord(word: string): string[];
    stemWord(word: string): string[];
    private performStringListResultOperation;
    generateByExample(word1: string, word2: string): string[];
    addWord(newWord: string): void;
    addWordWithFlags(newWord: string, flags: string, description: string): void;
    addWordWithAffix(newWord: string, example: string): void;
    removeWord(wordToRemove: string): void;
    addDictionaryFromFile(dictionaryFilePath: string): Promise<void>;
    addDictionaryFromString(dictionary: string): void;
    getDictionaryEncoding(): string;
    dispose(): void;
    private readStringList;
    private ensureNotDisposed;
    get isDisposed(): boolean;
}
export declare function getWasmModule(): Promise<any>;
