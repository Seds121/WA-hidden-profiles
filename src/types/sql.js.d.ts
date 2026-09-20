declare module "sql.js" {
  export type BindParams = (string | number | null | Uint8Array)[];

  export type QueryExecResult = {
    columns: string[];
    values: unknown[][];
  };

  export interface Statement {
    bind(params?: BindParams): void;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  }

  export interface Database {
    run(sql: string, params?: BindParams): void;
    exec(sql: string): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    getRowsModified(): number;
    close(): void;
  }

  export type SqlJsStatic = {
    Database: new (data?: Buffer | Uint8Array) => Database;
  };

  export interface InitSqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(
    config?: InitSqlJsConfig,
  ): Promise<SqlJsStatic>;
}
