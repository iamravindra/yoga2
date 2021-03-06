import { existsSync } from 'fs'
import { PrismaClientInput } from 'nexus-prisma/dist/types'
import { join } from 'path'
import { findPrismaConfigFile } from './config'
import { transpileAndImportDefault as transpileAndImport } from './helpers'
import {
  Config,
  InputConfig,
  InputOutputFilesConfig,
  InputPrismaConfig,
  DatamodelInfo,
} from './types'

const DEFAULTS: Config = {
  contextPath: './src/context.ts',
  resolversPath: './src/graphql/',
  ejectFilePath: './src/index.ts',
  output: {
    typegenPath: './yoga/nexus.ts',
    schemaPath: './src/schema.graphql',
    buildPath: './dist',
  },
  prisma: {
    /**
     * Do not use that as a default value, this is just a placeholder
     * When `datamodelInfo` isn't provided, we're importing it from `DEFAULT_NEXUS_PRISMA_SCHEMA_PATH` defined below
     */
    datamodelInfo: { schema: { __schema: null }, uniqueFieldsByModel: {} },
    /**
     * Do not use that as a default value, this is just a placeholder
     * When `client` isn't provided, we're importing it from `DEFAULT_NEXUS_PRISMA_SCHEMA_PATH` defined below
     */
    client: {
      $exists: null,
      $graphql: null as any, // FIXME
    },
  },
}

export const DEFAULT_META_SCHEMA_PATH = './yoga/nexus-prisma/datamodel-info.ts'
const DEFAULT_PRISMA_CLIENT_PATH = './yoga/prisma-client/index.ts'

/**
 * - Compute paths relative to the root of the project
 * - Set defaults when needed
 */
export async function normalizeConfig(
  config: InputConfig,
  projectDir: string,
  outDir: string | undefined,
): Promise<Config> {
  const outputProperty = output(projectDir, config.output, outDir)
  const outputConfig: Config = {
    contextPath: contextPath(projectDir, config.contextPath),
    resolversPath: resolversPath(projectDir, config.resolversPath),
    ejectFilePath: ejectFilePath(projectDir, config.ejectFilePath),
    output: outputProperty,
    prisma: await prisma(projectDir, config.prisma, outputProperty.buildPath),
  }

  return outputConfig
}

/**
 * Returns either a value from yoga.config.ts or from the defaults
 */
function inputOrDefaultValue(input: string | undefined, defaultValue: string) {
  return input ? input : defaultValue
}

/**
 * Returns either a user inputted path, or the default one
 * Join the path with the root project dir
 */
function inputOrDefaultPath(
  projectDir: string,
  input: string | undefined,
  defaultValue: string,
): string {
  const path = inputOrDefaultValue(input, defaultValue)

  return join(projectDir, path)
}

/**
 * Optional input path
 * If @input is provided, @path has to exists
 */
function optional(
  path: string,
  input: string | undefined,
  errorMessage: string,
) {
  if (!existsSync(path)) {
    if (input) {
      throw new Error(errorMessage)
    }

    return undefined
  }

  return path
}

/**
 * Optional required path
 * @path has to exists (from @input or @default)
 */
function requiredPath(path: string, errorMessage: string) {
  if (!existsSync(path)) {
    throw new Error(errorMessage)
  }

  return path
}

async function importDatamodelInfoAndClient(opts: {
  projectDir: string
  outDir: string
  client: PrismaClientInput | undefined
  datamodelInfo: string | undefined
}): Promise<[PrismaClientInput, DatamodelInfo]> {
  const filesToTranspile: { filePath: string; exportName: string }[] = []
  const output: any[] = []

  if (opts.client === undefined) {
    filesToTranspile.push({
      filePath: requiredPath(DEFAULT_PRISMA_CLIENT_PATH, ''),
      exportName: 'prisma',
    })
  } else {
    output.push(opts.client)
  }

  const datamodelInfoPath = inputOrDefaultPath(
    opts.projectDir,
    opts.datamodelInfo,
    DEFAULT_META_SCHEMA_PATH,
  )

  filesToTranspile.push({
    filePath: requiredPath(
      datamodelInfoPath,
      `Could not find a valid \`prisma.datamodelInfo\` at ${datamodelInfoPath}`,
    ),
    exportName: 'default',
  })

  const importedFiles = await transpileAndImport(
    filesToTranspile,
    opts.projectDir,
    opts.outDir,
  )

  return [...output, ...importedFiles] as [PrismaClientInput, DatamodelInfo]
}

function contextPath(
  projectDir: string,
  input: string | undefined,
): string | undefined {
  const path = inputOrDefaultPath(projectDir, input, DEFAULTS.contextPath!)

  return optional(
    path,
    input,
    `Could not find a valid \`contextPath\` at ${path}`,
  )
}

function resolversPath(projectDir: string, input: string | undefined): string {
  const path = inputOrDefaultPath(projectDir, input, DEFAULTS.resolversPath)

  return requiredPath(
    path,
    `Could not find a valid \`resolversPath\` at ${path}`,
  )
}

function ejectFilePath(
  projectDir: string,
  input: string | undefined,
): string | undefined {
  const path = inputOrDefaultPath(projectDir, input, DEFAULTS.ejectFilePath!)

  return optional(
    path,
    input,
    `Could not find a valid \`ejectFilePath\` at ${path}`,
  )
}

function output(
  projectDir: string,
  input: InputOutputFilesConfig | undefined,
  outDir: string | undefined,
): {
  typegenPath: string
  schemaPath: string
  buildPath: string
} {
  if (!input) {
    input = {}
  }

  const typegenPath = inputOrDefaultPath(
    projectDir,
    input.typegenPath,
    DEFAULTS.output.typegenPath,
  )
  const schemaPath = inputOrDefaultPath(
    projectDir,
    input.schemaPath,
    DEFAULTS.output.schemaPath,
  )
  /**
   * `outDir` is inputted from `tsconfig.json` It should therefore not be joined with `projectDir`
   * as typescript already resolve the path when parsing it
   */
  const buildPath = inputOrDefaultValue(
    outDir,
    join(projectDir, DEFAULTS.output.buildPath),
  )

  return {
    typegenPath,
    schemaPath,
    buildPath,
  }
}

async function prisma(
  projectDir: string,
  input: InputPrismaConfig | undefined,
  outDir: string,
): Promise<
  | {
      datamodelInfo: DatamodelInfo
      client: PrismaClientInput
    }
  | undefined
> {
  const hasPrisma = !!findPrismaConfigFile(projectDir)

  // If `prisma` undefined and no prisma.yml file, prisma isn't used
  if (input === undefined && !hasPrisma) {
    return Promise.resolve(undefined)
  }

  // If `prisma` === true or `prisma` === undefined but a prisma.yml file is found
  // Use all the defaults
  if (input === true || (input === undefined && hasPrisma)) {
    input = {}
  }

  const [client, datamodelInfo] = await importDatamodelInfoAndClient({
    datamodelInfo: input!.datamodelInfoPath,
    client: input!.client,
    outDir,
    projectDir,
  })

  return {
    datamodelInfo,
    client,
  }
}
