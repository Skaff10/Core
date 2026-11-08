import type { NativeSession } from './NativeSession';
import type { NativeStatement } from './NativeStatement';
/**
 * A class that represents an instance of the SQLite database.
 */
export declare class NativeDatabase {
    constructor(databasePath: string, options?: SQLiteOpenOptions, serializedData?: Uint8Array);
    initAsync(): Promise<void>;
    isInTransactionAsync(): Promise<boolean>;
    closeAsync(): Promise<void>;
    execAsync(source: string): Promise<void>;
    serializeAsync(databaseName: string): Promise<Uint8Array | ArrayBuffer>;
    prepareAsync(nativeStatement: NativeStatement, source: string): Promise<NativeStatement>;
    createSessionAsync(nativeSession: NativeSession, dbName: string): Promise<NativeSession>;
    loadExtensionAsync(libPath: string, entryPoint?: string): Promise<void>;
    initSync(): void;
    isInTransactionSync(): boolean;
    closeSync(): void;
    interruptSync(): void;
    execSync(source: string): void;
    serializeSync(databaseName: string): Uint8Array | ArrayBuffer;
    prepareSync(nativeStatement: NativeStatement, source: string): NativeStatement;
    createSessionSync(nativeSession: NativeSession, dbName: string): NativeSession;
    loadExtensionSync(libPath: string, entryPoint?: string): void;
}
/**
 * Options for opening a database.
 */
export interface SQLiteOpenOptions {
    /**
     * Whether to call the [`sqlite3_update_hook()`](https://www.sqlite.org/c3ref/update_hook.html) function and enable the `onDatabaseChange` events. You can later subscribe to the change events by [`addDatabaseChangeListener`](#sqliteadddatabasechangelistenerlistener).
     * @default false
     */
    enableChangeListener?: boolean;
    /**
     * Whether to create new connection even if connection with the same database name exists in cache.
     * @default false
     */
    useNewConnection?: boolean;
    /**
     * Finalized unclosed statements automatically when the database is closed.
     * @default true
     * @hidden
     */
    finalizeUnusedStatementsBeforeClosing?: boolean;
}
