import { parse } from 'csv-parse/sync';
import fs from 'fs';

/**
 * CSVを読み込んで返す
 */
export function readCsv(path: string): Array<Array<string>> {
  return parse(fs.readFileSync(path), { from: 2 }) as Array<Array<string>>;
}
