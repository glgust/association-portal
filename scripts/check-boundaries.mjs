import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const workspaceRoot = process.cwd()
const webRoot = path.join(workspaceRoot, 'apps', 'web')
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx'])
const ignoredDirectories = new Set(['.next', 'coverage', 'node_modules'])

const forbiddenWebImports = [
  /^@ascnucc\/cms(?:\/|$)/,
  /^@payloadcms(?:\/|$)/,
  /^payload(?:\/|$)/,
  /^@?prisma(?:\/|$)/,
  /^drizzle-/,
  /^pg(?:\/|$)/,
]

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) continue

    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await sourceFiles(absolutePath)))
    else if (sourceExtensions.has(path.extname(entry.name)))
      files.push(absolutePath)
  }

  return files
}

const importPattern = /(?:from\s+|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g
const violations = []

for (const file of await sourceFiles(webRoot)) {
  const source = await readFile(file, 'utf8')
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1]
    if (forbiddenWebImports.some((pattern) => pattern.test(specifier))) {
      violations.push(
        `${path.relative(workspaceRoot, file)} imports ${specifier}`,
      )
    }
  }
}

if (violations.length > 0) {
  console.error(
    'Dependency boundary violations:\n' +
      violations.map((item) => `- ${item}`).join('\n'),
  )
  process.exitCode = 1
} else {
  console.log(
    'Dependency boundaries passed: apps/web only consumes public contracts.',
  )
}
