document.addEventListener('DOMContentLoaded', () => {
  const promptForServer = (initialPrompt) => {
    let host = prompt(initialPrompt)
    while (true) {
      try {
        server = new WebSocket(`wss://${host}`)
        localStorage.setItem('server', server.url)
        return server
      } catch (e) {
        console.log(e)
        host = prompt(`error: ${e}\n\n try again`)
      }
    }
  }

  let server = null
  let __serverAddress = localStorage.getItem('server')

  if (__serverAddress === null) {
    server = promptForServer('enter server address')
  } else {
    try {
      server = new WebSocket(__serverAddress)
    } catch (e) {
      server = promptForServer('cached server address is unavailable. enter server address')
    }
  }

  const body = document.querySelector('body'),
  messages = document.querySelector('#messages'),
  entry = document.querySelector('#entry')

  let controlKeyHeld = false,
  userSettings = {
    name: localStorage.getItem('name') || 'anon',
    color: localStorage.getItem('color') || '#A0A0A0',
    theme: localStorage.getItem('theme') || 'dark',
    scrollThreshold: 50,
  }

  const commands = {
    help: () => {
      return `commands: ${Object.keys(commands).join(', ')}`
    },
    name: (args) => {
      if (args) {
        userSettings.name = args
        localStorage.setItem('name', userSettings.name)
        return `your name is now <span style="color:${userSettings.color}">${userSettings.name}</span>`
      }
      return `your name is <span style="color:${userSettings.color}">${userSettings.name}</span>`
    },
    color: (args) => {
      if (args) {
        userSettings.color = args
        localStorage.setItem('color', userSettings.color)
        return `your color is now <span style="color:${userSettings.color}">${userSettings.color}</span>`
      }
      return `your color is <span style="color:${userSettings.color}">${userSettings.color}</span>`
    }
  }

  const tryCommand = (contents) => {
    if (contents.charAt(0) === '/') {
      const cmdArgs = contents.split(' ', 2)
      const cmd = cmdArgs[0].slice(1)
      if (commands.hasOwnProperty(cmd)) {
        return commands[cmdArgs[0].slice(1)](cmdArgs.slice(1)[0])
      } else {
        return `unknown command: ${cmd}`
      }
    }
  }

  const processKeyboardEvent = (event) => {
    if (event.keyCode == 13 && !event.shiftKey) {
      // prevent newline character
      event.preventDefault()

      const contents = entry.value.trim()

      if (contents !== '') {
        // process entry contents
        const commandResult = tryCommand(contents)

        // handle command or handle message
        if (commandResult) {
          appendMessage(`<i class="client-message">${commandResult}</i>`)
        } else {
          try {
            server.send(`<span style="color:${userSettings.color}">${userSettings.name}: </span>${contents}`)
          } catch (e) {
            console.log(e)
            server = promptForServer('failed to send message. enter server address')
            server.onmessage = onMessage
          }
        }
      }

      // clear text entry contents
      entry.value = ''

      // don't trigger this event twice
      event.stopPropagation()
    }
  }

  const appendMessage = (contents) => {
    const scrollHeight = messages.scrollHeight
    
    messages.innerHTML += `<p class="msg">${contents}</p>`

    if (messages.scrollTop + userSettings.scrollThreshold >= scrollHeight) {
      messages.scrollTop = messages.scrollHeight
    }
  }

  const onMessage = (event) => {
    if (event.data instanceof Blob) {
      let reader = new FileReader()

      reader.onload = () => {
        appendMessage(reader.result);
      }

      reader.readAsText(event.data)
    } else {
      appendMessage(event.data)
    }
  }

  body.addEventListener('keydown', (event) => {
    if (event.keyCode === 17) {
      controlKeyHeld = true
    } else if (!controlKeyHeld) {
      entry.focus()
      processKeyboardEvent(event)
    }
  })

  body.addEventListener('keyup', (event) => {
    if (event.keyCode === 17) {
      controlKeyHeld = false
    }
  })

  entry.addEventListener('keydown', (event) => {
    processKeyboardEvent(event)
  })

  server.onmessage = onMessage
})