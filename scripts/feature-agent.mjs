#!/usr/bin/env node
/**
 * Feature Agent — builds a story from STORIES.md autonomously.
 *
 * Usage:
 *   node scripts/feature-agent.mjs --story 10
 *   node scripts/feature-agent.mjs --story 10 --model claude-opus-4-7
 *   node scripts/feature-agent.mjs --task "Add a loading skeleton to the audit page"
 */

import Anthropic from '@anthropic-ai/sdk'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

// ── Config ───────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DEFAULT_MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 8192
const MAX_TURNS = 40 // safety ceiling

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const get = (flag) => {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : null
}

const storyNum = get('--story')
const freeTask = get('--task')
const model = get('--model') ?? DEFAULT_MODEL

if (!storyNum && !freeTask) {
  console.error('Usage: node scripts/feature-agent.mjs --story <number>')
  console.error('       node scripts/feature-agent.mjs --task "<description>"')
  process.exit(1)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function readStory(num) {
  const storiesPath = resolve(ROOT, 'STORIES.md')
  const content = readFileSync(storiesPath, 'utf8')
  const header = `## Story ${num} —`
  const start = content.indexOf(header)
  if (start === -1) throw new Error(`Story ${num} not found in STORIES.md`)
  // find the next story heading or end of file
  const nextStory = content.indexOf('\n## Story ', start + 1)
  return nextStory === -1 ? content.slice(start) : content.slice(start, nextStory)
}

function readProjectContext() {
  const claudeMd = resolve(ROOT, 'CLAUDE.md')
  return existsSync(claudeMd) ? readFileSync(claudeMd, 'utf8') : ''
}

// ── Tool implementations ──────────────────────────────────────────────────────

function toolBash({ command, timeout_ms = 30000 }) {
  try {
    const out = execSync(command, {
      cwd: ROOT,
      timeout: timeout_ms,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { stdout: out, exit_code: 0 }
  } catch (e) {
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? String(e),
      exit_code: e.status ?? 1,
    }
  }
}

function toolReadFile({ path: filePath }) {
  const abs = resolve(ROOT, filePath)
  if (!existsSync(abs)) return { error: `File not found: ${filePath}` }
  return { content: readFileSync(abs, 'utf8') }
}

function toolWriteFile({ path: filePath, content }) {
  const abs = resolve(ROOT, filePath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content, 'utf8')
  return { success: true, path: filePath }
}

function toolListFiles({ directory = '.', pattern = '' }) {
  const cmd = pattern
    ? `find ${directory} -name "${pattern}" | grep -v node_modules | grep -v .next | grep -v .git | head -100`
    : `find ${directory} -type f | grep -v node_modules | grep -v .next | grep -v .git | head -100`
  return toolBash({ command: cmd })
}

// ── Tool definitions (Claude API format) ────────────────────────────────────

const TOOLS = [
  {
    name: 'bash',
    description:
      'Run a shell command in the project root. Use for: npm test, npm run build, npm run lint, git status, grep, find. Avoid interactive commands.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        timeout_ms: {
          type: 'number',
          description: 'Timeout in ms (default 30000, use 120000 for npm build)',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file. Path is relative to the project root.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path, e.g. src/app/page.tsx' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      'Write (create or overwrite) a file. Path is relative to the project root. Always write complete file contents.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path' },
        content: { type: 'string', description: 'Complete file contents' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_files',
    description: 'List files in a directory. Filters out node_modules, .next, .git automatically.',
    input_schema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Directory path relative to project root (default: ".")' },
        pattern: { type: 'string', description: 'Optional glob pattern, e.g. "*.tsx"' },
      },
      required: [],
    },
  },
]

// ── Tool dispatcher ───────────────────────────────────────────────────────────

function dispatchTool(name, input) {
  switch (name) {
    case 'bash':       return toolBash(input)
    case 'read_file':  return toolReadFile(input)
    case 'write_file': return toolWriteFile(input)
    case 'list_files': return toolListFiles(input)
    default:           return { error: `Unknown tool: ${name}` }
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(projectContext) {
  return `You are a senior software engineer building features for the "My Travel Assistant" Next.js project.

## Your working environment
- Project root: ${ROOT}
- You have four tools: bash, read_file, write_file, list_files
- All file paths are relative to the project root

## Project context
${projectContext}

## How to approach a feature
1. Read and fully understand the story spec before writing any code
2. Explore existing code to understand patterns (read similar files first)
3. Implement files one at a time, following the project's conventions exactly
4. After writing all files, run: npm run build (timeout 120000ms) and npm test
5. Fix any type errors, lint errors, or test failures before declaring done
6. Do not leave console.log in production code
7. Do not add features or refactor beyond what the story spec requires

## Definition of Done
- All acceptance criteria in the story are met
- npm run build passes with zero errors
- npm test passes
- No console.log in production code

When you are done, write a brief summary of what you built.`
}

// ── Main agentic loop ─────────────────────────────────────────────────────────

async function run() {
  const client = new Anthropic()

  const projectContext = readProjectContext()
  const systemPrompt = buildSystemPrompt(projectContext)

  let userMessage
  if (storyNum) {
    const storySpec = readStory(storyNum)
    userMessage = `Build Story ${storyNum} from STORIES.md. Here is the full spec:\n\n${storySpec}`
  } else {
    userMessage = `Complete the following task:\n\n${freeTask}`
  }

  console.log(`\n🤖  Feature Agent starting`)
  console.log(`   Model  : ${model}`)
  console.log(`   Task   : ${storyNum ? `Story ${storyNum}` : freeTask}`)
  console.log(`   Root   : ${ROOT}`)
  console.log('─'.repeat(60) + '\n')

  const messages = [{ role: 'user', content: userMessage }]
  let turns = 0

  while (turns < MAX_TURNS) {
    turns++

    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    })

    // Collect text output and tool uses from this response
    const toolUses = []
    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        console.log(`\n💬  ${block.text.trim()}\n`)
      }
      if (block.type === 'tool_use') {
        toolUses.push(block)
      }
    }

    // Push assistant message
    messages.push({ role: 'assistant', content: response.content })

    // If no tool calls, agent is done
    if (response.stop_reason === 'end_turn' && toolUses.length === 0) {
      console.log('\n✅  Agent finished.\n')
      break
    }

    // Execute all tool calls and collect results
    const toolResults = []
    for (const toolUse of toolUses) {
      const { name, id, input } = toolUse
      console.log(`🔧  ${name}(${JSON.stringify(input).slice(0, 120)})`)

      const result = dispatchTool(name, input)

      // Show abbreviated output
      const resultStr = JSON.stringify(result)
      if (resultStr.length > 300) {
        console.log(`    → ${resultStr.slice(0, 300)}…`)
      } else {
        console.log(`    → ${resultStr}`)
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: id,
        content: JSON.stringify(result),
      })
    }

    // Push tool results back to conversation
    messages.push({ role: 'user', content: toolResults })
  }

  if (turns >= MAX_TURNS) {
    console.warn(`\n⚠️  Reached max turns (${MAX_TURNS}). Agent stopped.`)
  }
}

run().catch((err) => {
  console.error('\n❌  Agent error:', err.message)
  process.exit(1)
})
