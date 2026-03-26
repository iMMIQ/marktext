import { defineStore } from 'pinia'
import log from 'electron-log'
import bus from '@/bus'
import staticCommands, { RootCommand } from '@/commands'
import events from '@/services/nativeApi/events'

let isCommandCenterBusBound = false

const createCommandCenterState = () => ({
  rootCommand: new RootCommand(staticCommands)
})

const normalizeAccelerator = acc => {
  try {
    return acc
      .replace(/cmdorctrl|cmd/i, 'Cmd')
      .replace(/ctrl/i, 'Ctrl')
      .split('+')
  } catch (_) {
    return [acc]
  }
}

export const useCommandCenterStore = defineStore('commandCenter', {
  state: createCommandCenterState,
  actions: {
    registerCommand (command) {
      this.rootCommand.subcommands.push(command)
    },
    sortCommands () {
      this.rootCommand.subcommands.sort((a, b) => a.description.localeCompare(b.description))
    },
    executeCommand (commandId) {
      const command = this.rootCommand.subcommands.find(entry => entry.id === commandId)
      if (!command) {
        const errorMsg = `Cannot execute command "${commandId}" because it's missing.`
        log.error(errorMsg)
        throw new Error(errorMsg)
      }

      command.execute()
    },
    bindCommandCenterBus () {
      if (isCommandCenterBusBound) {
        return
      }

      bus.$on('cmd::sort-commands', () => {
        this.sortCommands()
      })

      events.on('mt::keybindings-response', (event, keybindingMap) => {
        for (const entry of this.rootCommand.subcommands) {
          const value = keybindingMap[entry.id]
          if (value) {
            entry.shortcut = normalizeAccelerator(value)
          }
        }
      })

      bus.$on('cmd::register-command', command => {
        this.registerCommand(command)
      })

      bus.$on('cmd::execute', commandId => {
        this.executeCommand(commandId)
      })

      events.on('mt::execute-command-by-id', (event, commandId) => {
        this.executeCommand(commandId)
      })

      isCommandCenterBusBound = true
    }
  }
})
