import { IOptions, sync } from 'glob';
import * as glob from 'glob';
import { extname } from 'path';
import { readFileSync, readFile } from 'fs';
import { print } from 'graphql';
import { IResolvers } from '@kamilkisiela/graphql-tools';
import * as isGlob from 'is-glob';

const DEFAULT_SCHEMA_EXTENSIONS = ['gql', 'graphql', 'graphqls', 'ts', 'js'];
const DEFAULT_IGNORED_RESOLVERS_EXTENSIONS = ['spec', 'test', 'd'];
const DEFAULT_RESOLVERS_EXTENSIONS = ['ts', 'js'];
const DEFAULT_SCHEMA_EXPORT_NAMES = ['typeDefs', 'schema'];
const DEFAULT_RESOLVERS_EXPORT_NAMES = ['resolvers', 'resolver'];

function scanForFiles(globStr: string, globOptions: IOptions = {}): string[] {
  return sync(globStr, { absolute: true, ...globOptions });
}

function buildGlob(basePath: string, extensions: string[], ignoredExtensions: string[] = [], recursive: boolean): string {
  return `${basePath}${recursive ? '/**' : ''}/${ignoredExtensions.length > 0 ? `!(${ignoredExtensions.map(e => '*.' + e).join('|')})` : '*'}+(${extensions.map(e => '*.' + e).join('|')})`;
}

function extractExports(fileExport: any, exportNames: string[]): any | null {
  if (!fileExport) {
    return null;
  }

  if (fileExport.default) {
    for (const exportName of exportNames) {
      if (fileExport.default[exportName]) {
        return fileExport.default[exportName];
      }
    }

    return fileExport.default;
  }


  for (const exportName of exportNames) {
    if (fileExport[exportName]) {
      return fileExport[exportName];
    }
  }

  return fileExport;
}

export interface LoadSchemaFilesOptions {
  extensions?: string[];
  useRequire?: boolean;
  requireMethod?: any;
  globOptions?: IOptions;
  exportNames?: string[];
  recursive?: boolean;
}

const LoadSchemaFilesDefaultOptions: LoadSchemaFilesOptions = {
  extensions: DEFAULT_SCHEMA_EXTENSIONS,
  useRequire: false,
  requireMethod: null,
  globOptions: {},
  exportNames: DEFAULT_SCHEMA_EXPORT_NAMES,
  recursive: true,
};

export function loadSchemaFiles(path: string, options: LoadSchemaFilesOptions = LoadSchemaFilesDefaultOptions): string[] {
  const execOptions = { ...LoadSchemaFilesDefaultOptions, ...options };
  const relevantPaths = scanForFiles(isGlob(path) ? path : buildGlob(path, execOptions.extensions, [], execOptions.recursive), options.globOptions);

  return relevantPaths.map(path => {
    const extension = extname(path);

    if (extension.endsWith('.js') || extension.endsWith('.ts') || execOptions.useRequire) {
      const fileExports = (execOptions.requireMethod ? execOptions.requireMethod : eval('require'))(path);
      const extractedExport = extractExports(fileExports, execOptions.exportNames);

      if (extractedExport && extractedExport.kind === 'Document') {
        return print(extractedExport);
      }

      return extractedExport;
    } else {
      return readFileSync(path, { encoding: 'utf-8' });
    }
  });
}

export interface LoadResolversFilesOptions {
  ignoredExtensions?: string[];
  extensions?: string[];
  requireMethod?: any;
  globOptions?: IOptions;
  exportNames?: string[];
  recursive?: boolean;
}

const LoadResolversFilesDefaultOptions: LoadResolversFilesOptions = {
  ignoredExtensions: DEFAULT_IGNORED_RESOLVERS_EXTENSIONS,
  extensions: DEFAULT_RESOLVERS_EXTENSIONS,
  requireMethod: null,
  globOptions: {},
  exportNames: DEFAULT_RESOLVERS_EXPORT_NAMES,
  recursive: true,
};

export function loadResolversFiles<Resolvers extends IResolvers = IResolvers>(path: string, options: LoadResolversFilesOptions = LoadResolversFilesDefaultOptions): Resolvers[] {
  const execOptions = { ...LoadResolversFilesDefaultOptions, ...options };
  const relevantPaths = scanForFiles(isGlob(path) ? path : buildGlob(path, execOptions.extensions, [], execOptions.recursive), options.globOptions);

  return relevantPaths.map(path => {
    try {
      const fileExports = (execOptions.requireMethod ? execOptions.requireMethod : eval('require'))(path);

      return extractExports(fileExports, execOptions.exportNames);
    } catch (e) {
      throw new Error(`Unable to load resolver file: ${path}, error: ${e}`);
    }
  }).filter(t => t);
}

function scanForFilesAsync(globStr: string, globOptions: IOptions = {}): Promise<string[]> {
  return new Promise((resolve, reject) => glob(globStr, { absolute: true, ...globOptions }, (err, matches) => {
    if (err) {
      reject(err);
    }
    resolve(matches);
  }));
}

export async function loadSchemaFilesAsync(path: string, options: LoadSchemaFilesOptions = LoadSchemaFilesDefaultOptions): Promise<string[]> {
  const execOptions = { ...LoadSchemaFilesDefaultOptions, ...options };
  const relevantPaths = await scanForFilesAsync(isGlob(path) ? path : buildGlob(path, execOptions.extensions, [], execOptions.recursive), options.globOptions);

  const require$ = (path: string) => eval(`import('${path}')`);

  return Promise.all(relevantPaths.map(async path => {
    const extension = extname(path);

    if (extension.endsWith('.js') || extension.endsWith('.ts') || execOptions.useRequire) {
      const fileExports = await (execOptions.requireMethod ? execOptions.requireMethod : require$)(path);
      const extractedExport = extractExports(fileExports, execOptions.exportNames);

      if (extractedExport && extractedExport.kind === 'Document') {
        return print(extractedExport);
      }

      return extractedExport;
    } else {
      return new Promise((resolve, reject) => {
        readFile(path, { encoding: 'utf-8' }, (err, data) => {
          if (err) {
            reject(err);
          }
          resolve(data);
        })
      });
    }
  }));
}

export async function loadResolversFilesAsync<Resolvers extends IResolvers = IResolvers>(path: string, options: LoadResolversFilesOptions = LoadResolversFilesDefaultOptions): Promise<Resolvers[]> {
  const execOptions = { ...LoadResolversFilesDefaultOptions, ...options };
  const relevantPaths = await scanForFilesAsync(isGlob(path) ? path : buildGlob(path, execOptions.extensions, [], execOptions.recursive), options.globOptions);

  const require$ = (path: string) => eval(`import('${path}')`);

  return Promise.all(relevantPaths.map(async path => {
    try {
      const fileExports = await (execOptions.requireMethod ? execOptions.requireMethod : require$)(path);

      return extractExports(fileExports, execOptions.exportNames);
    } catch (e) {
      throw new Error(`Unable to load resolver file: ${path}, error: ${e}`);
    }
  }));
}
