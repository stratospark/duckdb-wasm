import * as format from './utils/format';
import * as arrow from 'apache-arrow';
import kleur from 'kleur';
import { addAsync, suite, cycle } from './bench';
import { DBProxy } from './db_config';

function gaussSum(n: number): number {
    return Math.trunc(0.5 * n * (n + 1));
}

export async function benchmarkCompetitions(
    dbs: DBProxy[],
    basedir: string,
    tableFetch: (path: string) => Promise<arrow.Table>,
    tpchScale: string,
): Promise<void> {
    const tupleCount = 10000;
    const col = [];
    for (let i = 0; i <= tupleCount; i++) {
        col.push(i);
    }
    const table = arrow.Table.new([arrow.Int32Vector.from(col)], ['a']);
    const scans = [];
    const sums = [];

    for (const db of dbs) {
        await db.init();
        await db.create(`scan_table`, table, []);
        await db.load(`scan_table`, null, table);

        if (db.implements('scanInt')) {
            scans.push(() =>
                addAsync(db.name, async () => {
                    await db.scanInt();
                }),
            );
        }
        if (db.implements('sum')) {
            sums.push(() =>
                addAsync(db.name, async () => {
                    const val = await db.sum();

                    if (val != gaussSum(tupleCount)) {
                        throw db.name + ' mismatch';
                    }
                }),
            );
        }
    }

    await suite(
        `Table Scan ${tupleCount} simple rows`,
        ...scans.map(x => x()),
        cycle((result: any, _summary: any): string => {
            const duration = result.details.median;
            console.info(
                `${kleur.cyan(result.name)} t: ${duration.toFixed(5)}s ${format.formatThousands(
                    tupleCount / duration,
                )} rows/s`,
            );
            return '';
        }),
    );

    await suite(
        `Sum of ${tupleCount} int rows`,
        ...sums.map(x => x()),
        cycle((result: any, _summary: any): string => {
            const duration = result.details.median;
            console.info(`${kleur.cyan(result.name)} t: ${duration.toFixed(5)}s`);
            return '';
        }),
    );

    for (const db of dbs) {
        await db.close();
    }

    const keys: { [key: string]: string[][] } = {
        customer: [['c_custkey']],
        lineitem: [['l_orderkey', 'l_linenumber']],
        region: [['r_regionkey']],
        orders: [['o_orderkey']],
        nation: [['n_nationkey']],
        part: [['p_partkey']],
        partsupp: [],
        supplier: [['s_suppkey']],
    };
    const tables: { [key: string]: arrow.Table } = {};
    for (const k of Object.keys(keys)) {
        tables[k] = await tableFetch(`${basedir}/tpch/${tpchScale}/parquet/${k}.parquet`);
    }

    const primaryJoins: any[] = [];
    const tpchs: any[][] = [];
    for (let i = 1; i <= 22; i++) {
        tpchs[i] = [];
    }

    console.info('Loading TPCH');
    for (const db of dbs) {
        if (!db.implements('join')) continue;
        console.log(db.name);

        await db.init();
        for (const [k, v] of Object.entries(tables)) {
            await db.create(k, v, keys[k]);
        }
        for (const [k, v] of Object.entries(tables)) {
            console.log(k);
            await db.load(k, `${basedir}/tpch/${tpchScale}/parquet/${k}.parquet`, v);
        }
        primaryJoins.push(() => addAsync(db.name, async () => await db.join()));
    }

    for (let i = 1; i <= 22; i++) {
        for (const db of dbs) {
            if (db.implements('tpch') && db.implements(`tpch-${i}`)) {
                tpchs[i].push(() => addAsync(db.name, async () => await db.tpch(i)));
            }
        }
    }

    if (primaryJoins.length > 0) {
        await suite(
            `Simple primary key join`,
            ...primaryJoins.map(x => x()),
            cycle((result: any, _summary: any): string => {
                const duration = result.details.mean.toFixed(5);
                const margin = result.margin.toFixed(2);
                console.info(`${kleur.cyan(result.name)} t: ${duration}s ±${margin}% (${result.samples} samples)`);
                return '';
            }),
        );
    }

    for (let i = 0; i < tpchs.length; ++i) {
        if (tpchs[i].length > 0) {
            await suite(
                `TPCH-${i} query`,
                // For some odd reason, we need to use functions in this scenario in headless browsers...
                ...tpchs[i].map(x => x()),
                cycle((result: any, _summary: any) => {
                    const duration = result.details.mean.toFixed(5);
                    const margin = result.margin.toFixed(2);
                    console.info(`${kleur.cyan(result.name)} t: ${duration}s ±${margin}% (${result.samples} samples)`);
                }),
            );
        }
    }

    for (const db of dbs) {
        await db.close();
    }
}