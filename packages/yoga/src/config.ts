import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'
import { importFile } from './helpers'
import { Config, InputConfig, InputPrismaConfig } from './types'
import { normalizeConfig, DEFAULT_META_SCHEMA_PATH } from './yogaDefaults'

/**
 * Find a `prisma.yml` file if it exists
 */
export function findPrismaConfigFile(projectDir: string): string | null {
  let definitionPath = path.join(projectDir, 'prisma.yml')

  if (fs.existsSync(definitionPath)) {
    return definitionPath
  }

  definitionPath = path.join(process.cwd(), 'prisma', 'prisma.yml')

  if (fs.existsSync(definitionPath)) {
    return definitionPath
  }

  return null
}

/**
 * Find `tsconfig.json` file
 */
export function findTsConfigPath(): string {
  const tsConfigPath = ts.findConfigFile(
    /*searchPath*/ process.cwd(),
    ts.sys.fileExists,
    'tsconfig.json',
  )

  if (!tsConfigPath) {
    throw new Error("Could not find a valid 'tsconfig.json'.")
  }

  return tsConfigPath
}

/**
 * Parse a `tsconfig.json` file
 * @param tsConfigPath Path to a `tsconfig.json` file
 */
export function parseTsConfig(tsConfigPath: string): ts.ParsedCommandLine {
  const projectDir = path.dirname(tsConfigPath)
  const tsConfig = ts.parseJsonConfigFileContent(
    require(tsConfigPath),
    ts.sys,
    projectDir,
  )

  if (!tsConfig.options.rootDir || !tsConfig.options.outDir) {
    throw new Error(
      "You must define a `rootDir` and `outDir` property in your 'tsconfig.json' file",
    )
  }

  return tsConfig
}

function getDatamodelInfoPath(prismaConfig?: InputPrismaConfig): string {
  if (
    !prismaConfig ||
    prismaConfig === true ||
    !prismaConfig.datamodelInfoPath
  ) {
    return DEFAULT_META_SCHEMA_PATH
  }

  return prismaConfig.datamodelInfoPath
}

/**
 * Dynamically import a `yoga.config.ts` file
 */
export function importYogaConfig(): {
  yogaConfigPath?: string
  yogaConfig: Config
  inputConfig: InputConfig
  projectDir: string
  tsConfigPath: string
  tsConfig: ts.ParsedCommandLine
  datamodelInfoPath?: string
  rootDir: string
} {
  const tsConfigPath = findTsConfigPath()
  const tsConfig = parseTsConfig(tsConfigPath)
  const projectDir = path.dirname(tsConfigPath)
  const rootDir = tsConfig.options.rootDir!
  const yogaConfigPath = ts.findConfigFile(
    /*searchPath*/ process.cwd(),
    ts.sys.fileExists,
    'yoga.config.ts',
  )

  // If no config file, just use all defaults
  if (!yogaConfigPath) {
    const yogaConfig = normalizeConfig({}, projectDir, tsConfig.options.outDir)
    return {
      yogaConfig,
      datamodelInfoPath: yogaConfig.prisma
        ? DEFAULT_META_SCHEMA_PATH
        : undefined,
      projectDir,
      rootDir,
      tsConfigPath,
      tsConfig,
      inputConfig: {},
    }
  }

  const inputConfig = importFile<InputConfig>(yogaConfigPath, 'default')

  const yogaConfig = normalizeConfig(
    inputConfig,
    projectDir,
    tsConfig.options.outDir!,
  )

  return {
    yogaConfig,
    yogaConfigPath,
    projectDir,
    rootDir,
    tsConfigPath,
    tsConfig,
    datamodelInfoPath: getDatamodelInfoPath(inputConfig.prisma),
    inputConfig,
  }
}
