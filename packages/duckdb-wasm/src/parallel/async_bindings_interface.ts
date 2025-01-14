import { Logger } from '../log';
import { CSVInsertOptions, JSONInsertOptions } from '../bindings/insert_options';

/** An interface for the async DuckDB bindings */
export interface AsyncDuckDBBindings {
    logger: Logger;

    registerFileURL(name: string, url: string, size: number): Promise<void>;
    registerFileBuffer(name: string, buffer: Uint8Array): Promise<void>;
    registerFileHandle<HandleType>(name: string, handle: HandleType): Promise<void>;
    copyFileToPath(name: string, out: string): Promise<void>;
    copyFileToBuffer(name: string): Promise<Uint8Array>;

    disconnect(conn: number): Promise<void>;
    runQuery(conn: number, text: string): Promise<Uint8Array>;
    sendQuery(conn: number, text: string): Promise<Uint8Array>;
    fetchQueryResults(conn: number): Promise<Uint8Array>;

    createPrepared(conn: number, text: string): Promise<number>;
    closePrepared(conn: number, statement: number): Promise<void>;
    runPrepared(conn: number, statement: number, params: any[]): Promise<Uint8Array>;
    sendPrepared(conn: number, statement: number, params: any[]): Promise<Uint8Array>;

    insertArrowFromIPCStream(conn: number, buffer: Uint8Array, options?: CSVInsertOptions): Promise<void>;
    insertCSVFromPath(conn: number, path: string, options: CSVInsertOptions): Promise<void>;
    insertJSONFromPath(conn: number, path: string, options: JSONInsertOptions): Promise<void>;
}
