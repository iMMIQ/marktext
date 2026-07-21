import fs from 'fs'
import os from 'os'
import path from 'path'
import process from 'process'
import { spawn, spawnSync } from 'child_process'

const ROOT = process.cwd()
const PLAYWRIGHT = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'playwright.cmd' : 'playwright')
const DEFAULT_TARGET = 'test/e2e'
const CONFIG_ARGS = ['test', '-c', 'test/e2e/playwright.config.js']
const PREFLIGHT_ARG = '--desktop-isolation-preflight'

const run = (command, args, env) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: ROOT, env, stdio: 'inherit' })
  child.once('error', reject)
  child.once('exit', (code, signal) => resolve(signal ? 1 : (code || 0)))
})

const commandPath = command => {
  const result = spawnSync('which', [command], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : ''
}

const runInLinuxSandbox = async () => {
  const bubblewrap = commandPath('bwrap')
  if (!bubblewrap) {
    throw new Error('bubblewrap is required to keep Linux E2E isolated from the desktop session.')
  }

  const uid = process.getuid()
  const runtimeDir = `/run/user/${uid}`
  const sandboxArgs = [
    '--die-with-parent',
    '--unshare-user',
    '--ro-bind', '/', '/',
    '--bind', ROOT, ROOT,
    '--dev', '/dev',
    '--proc', '/proc',
    '--unshare-pid',
    '--unshare-ipc',
    '--unshare-net',
    '--unshare-uts',
    '--new-session',
    '--tmpfs', '/tmp',
    '--tmpfs', runtimeDir,
    '--tmpfs', path.join(os.homedir(), '.cache'),
    '--tmpfs', path.join(os.homedir(), '.config'),
    '--chdir', ROOT,
    '--setenv', 'MARKTEXT_E2E_SANDBOXED', '1',
    '--setenv', 'MARKTEXT_E2E_HOST_DISPLAY', process.env.DISPLAY || '',
    '--setenv', 'MARKTEXT_E2E_HOST_NET_NS', fs.readlinkSync('/proc/self/ns/net'),
    '--setenv', 'MARKTEXT_E2E_HOST_PID_NS', fs.readlinkSync('/proc/self/ns/pid'),
    '--setenv', 'MARKTEXT_E2E_HOST_IPC_NS', fs.readlinkSync('/proc/self/ns/ipc'),
    '--setenv', 'XDG_RUNTIME_DIR', runtimeDir,
    '--unsetenv', 'DISPLAY',
    '--unsetenv', 'WAYLAND_DISPLAY',
    '--unsetenv', 'DBUS_SESSION_BUS_ADDRESS',
    '--unsetenv', 'XAUTHORITY',
    '--unsetenv', 'DESKTOP_STARTUP_ID',
    '--unsetenv', 'XDG_ACTIVATION_TOKEN'
  ]

  const customXvfb = process.env.MARKTEXT_E2E_XVFB
  if (customXvfb) {
    sandboxArgs.push(
      '--dir', '/tmp/marktext-e2e',
      '--ro-bind', customXvfb, '/tmp/marktext-e2e/Xvfb',
      '--setenv', 'MARKTEXT_E2E_XVFB', '/tmp/marktext-e2e/Xvfb'
    )
  }

  sandboxArgs.push(process.execPath, import.meta.filename, ...process.argv.slice(2))
  return run(bubblewrap, sandboxArgs, process.env)
}

const assertLinuxDesktopIsHidden = () => {
  const hostDisplay = process.env.MARKTEXT_E2E_HOST_DISPLAY || ''
  const displayNumber = hostDisplay.match(/^:(\d+)/)?.[1]
  if (displayNumber && fs.existsSync(`/tmp/.X11-unix/X${displayNumber}`)) {
    throw new Error(`Host X11 display ${hostDisplay} is still reachable inside the E2E sandbox.`)
  }

  const runtimeDir = `/run/user/${process.getuid()}`
  if (fs.existsSync(path.join(runtimeDir, 'bus')) ||
      fs.readdirSync(runtimeDir).some(name => name.startsWith('wayland-'))) {
    throw new Error('Host DBus or Wayland sockets are still reachable inside the E2E sandbox.')
  }

  const namespaces = [
    ['net', process.env.MARKTEXT_E2E_HOST_NET_NS],
    ['pid', process.env.MARKTEXT_E2E_HOST_PID_NS],
    ['ipc', process.env.MARKTEXT_E2E_HOST_IPC_NS]
  ]
  for (const [name, hostNamespace] of namespaces) {
    if (!hostNamespace) {
      throw new Error(`The host ${name} namespace identity is missing inside the E2E sandbox.`)
    }
    if (fs.readlinkSync(`/proc/self/ns/${name}`) === hostNamespace) {
      throw new Error(`The host ${name} namespace is still reachable inside the E2E sandbox.`)
    }
  }
}

const assertPrivateDisplay = display => {
  const displayName = `:${display}`
  if (displayName === process.env.MARKTEXT_E2E_HOST_DISPLAY) {
    throw new Error(`Private display ${displayName} unexpectedly matches the host display.`)
  }

  const socket = `/tmp/.X11-unix/X${display}`
  if (!fs.existsSync(socket) || !fs.lstatSync(socket).isSocket()) {
    throw new Error(`Private Xvfb socket ${socket} is unavailable.`)
  }
}

const findDisplay = () => {
  for (let display = 99; display < 200; display++) {
    if (!fs.existsSync(`/tmp/.X11-unix/X${display}`) && !fs.existsSync(`/tmp/.X${display}-lock`)) {
      return display
    }
  }
  throw new Error('No free X display is available for the E2E suite.')
}

const waitForDisplay = (xvfb, display) => new Promise((resolve, reject) => {
  const socket = `/tmp/.X11-unix/X${display}`
  const deadline = Date.now() + 5000
  let spawnError = null
  xvfb.once('error', error => { spawnError = error })
  const poll = () => {
    if (spawnError) return reject(spawnError)
    if (fs.existsSync(socket)) return resolve()
    if (xvfb.exitCode !== null) return reject(new Error(`Xvfb exited with code ${xvfb.exitCode}.`))
    if (Date.now() >= deadline) return reject(new Error('Timed out while starting Xvfb.'))
    setTimeout(poll, 25)
  }
  poll()
})

const runIsolatedOnLinux = async (args, preflightOnly) => {
  const display = findDisplay()
  fs.mkdirSync('/tmp/.X11-unix', { recursive: true, mode: 0o1777 })
  fs.chmodSync('/tmp/.X11-unix', 0o1777)
  const xvfb = spawn(process.env.MARKTEXT_E2E_XVFB || 'Xvfb', [
    `:${display}`,
    '-screen', '0', '1440x900x24',
    '-nolisten', 'tcp',
    '-ac',
    '-extension', 'GLX'
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  xvfb.stderr.on('data', chunk => { stderr += chunk })

  try {
    await waitForDisplay(xvfb, display)
  } catch (error) {
    xvfb.kill('SIGTERM')
    const detail = stderr.trim() ? `\n${stderr.trim()}` : ''
    throw new Error(`${error.message}${detail}\nInstall Xvfb to run Linux E2E without using the desktop display.`)
  }

  const stop = () => {
    if (xvfb.exitCode === null) xvfb.kill('SIGTERM')
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)

  try {
    const env = {
      ...process.env,
      DISPLAY: `:${display}`,
      WAYLAND_DISPLAY: '',
      XDG_SESSION_TYPE: 'x11',
      GDK_BACKEND: 'x11',
      GTK_USE_PORTAL: '0',
      QT_QPA_PLATFORM: 'xcb',
      ELECTRON_OZONE_PLATFORM_HINT: 'x11',
      MARKTEXT_E2E_ISOLATED: '1',
      MARKTEXT_EXIT_ON_ERROR: '1'
    }
    delete env.DBUS_SESSION_BUS_ADDRESS
    if (preflightOnly) {
      assertLinuxDesktopIsHidden()
      assertPrivateDisplay(display)
      console.log(`Desktop isolation preflight passed on private display :${display}.`)
      return 0
    }
    return await run('dbus-run-session', [PLAYWRIGHT, ...args], env)
  } finally {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
    stop()
  }
}

const rawTargets = process.argv.slice(2)
const preflightOnly = rawTargets.includes(PREFLIGHT_ARG)
const targets = rawTargets.filter(target => target !== PREFLIGHT_ARG)
const args = [...CONFIG_ARGS, ...(targets.length ? targets : [DEFAULT_TARGET])]
let exitCode

if (process.platform === 'linux' && process.env.MARKTEXT_E2E_SANDBOXED === '1') {
  assertLinuxDesktopIsHidden()
}

if (process.platform === 'linux' &&
    process.env.MARKTEXT_E2E_SANDBOXED !== '1') {
  exitCode = await runInLinuxSandbox()
} else if (process.platform === 'linux') {
  exitCode = await runIsolatedOnLinux(args, preflightOnly)
} else {
  if (preflightOnly) {
    throw new Error('Desktop isolation preflight is only supported on Linux.')
  }
  exitCode = await run(PLAYWRIGHT, args, {
    ...process.env,
    MARKTEXT_E2E_ISOLATED: '1',
    MARKTEXT_EXIT_ON_ERROR: '1'
  })
}

process.exitCode = exitCode
