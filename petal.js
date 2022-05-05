document.addEventListener('DOMContentLoaded', () => {
  const promptForServer = (initialPrompt) => {
    let host = prompt(initialPrompt)
    while (true) {
      try {
        server = new WebSocket(`wss://${host || 'lynn.fun:8080'}`)
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
    server = promptForServer('enter server address (or leave blank for lynn.fun:8080)')
  } else {
    try {
      server = new WebSocket(__serverAddress)
    } catch (e) {
      server = promptForServer('cached server address is unavailable. enter server address (or leave blank for lynn.fun:8080)')
    }
  }

  const body = document.querySelector('body'),
  messages = document.querySelector('#messages'),
  entry = document.querySelector('#entry')

  let controlKeyHeld = false,
  sanitizeConfig = { ALLOWED_TAGS: ['span', 'strong', 'b', 'em', 'i'], ALLOWED_ATTR: [] },
  userData = {
    token: localStorage.getItem('token') || undefined,
    name: localStorage.getItem('name') || undefined,
    color: localStorage.getItem('color') || undefined,
    theme: localStorage.getItem('theme') || 'dark',
    scrollThreshold: localStorage.getItem('scrollThreshold') || 50,
  }

  const commands = {
    help: () => {
      appendMessage(`commands: ${Object.keys(commands).join(', ')}`, true)
    },
    name: (args) => {
      if (args) {
        server.send(JSON.stringify({
          type: 'auth-name',
          name: DOMPurify.sanitize(args, sanitizeConfig)
        }))
      } else {
        appendMessage('missing required name argument. example: /name cooluser23', true)
      }
    },
    color: (args) => {
      if (args) {
        server.send(JSON.stringify({
          type: 'command-color',
          color: DOMPurify.sanitize(args, sanitizeConfig)
        }))
      } else {
        appendMessage('missing required color argument. examples: /color pink, /color #fffaaa, /color rgb(200, 200, 100)', true)
      }
    }
  }

  const tryCommand = (contents) => {
    if (contents.charAt(0) === '/') {
      const cmdArgs = contents.split(' ', 2)
      const cmd = cmdArgs[0].slice(1)
      if (commands.hasOwnProperty(cmd)) {
        commands[cmdArgs[0].slice(1)](cmdArgs.slice(1)[0])
      } else {
        appendMessage((commandResult, true)`unknown command: ${cmd}`, true)
      }
      return true
    }
    return false
  }

  const processKeyboardEvent = (event) => {
    if (event.keyCode == 13 && !event.shiftKey) {
      // prevent newline character
      event.preventDefault()

      const cleanContents = cleanMessage(entry.value)

      if (cleanContents !== '') {
        // process entry contents
        const wasCommand = tryCommand(cleanContents)

        if (!wasCommand) {
          try {
            server.send(JSON.stringify({
              type: 'message',
              body: cleanContents
            }))
          } catch (e) {
            console.log(e)
            server = promptForServer('failed to send message. enter server address (or leave blank for lynn.fun:8080)')
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

  const cleanMessage = (contents) => {
    const cleanContents = contents

    if (cleanContents instanceof Blob) {
      const reader = new FileReader()

      reader.onload = () => {
        cleanContents = DOMPurify.sanitize(reader.result, sanitizeConfig)
      }

      reader.readAsText(contents)
    }

    return cleanContents.trim()
  }

  const appendMessage = (message, system) => {
    const scrollHeight = messages.scrollHeight

    messages.innerHTML += `<p class="msg${system ? ' msg--system' : ''}">${message}</p>`

    if (messages.clientHeight + messages.scrollTop + userData.scrollThreshold >= scrollHeight) {
      messages.scrollTop = messages.scrollHeight
    }
  }

  const handleMessage = (payload) => {
    let cleanBody = cleanMessage(payload.body)

    if (cleanBody !== '') {
      appendMessage(`<b style="color:${payload.nameColor}">${payload.name}: </b>${cleanBody}`)
    }
  }

  const onMessage = (event) => {
    const payload = JSON.parse(event.data)

    switch (payload.type) {
      case 'auth-exists':
        if (userData.token !== undefined) {
          appendMessage('name already exists, attempting to log in using the stored token...', true)
          server.send(JSON.stringify({
            type: 'auth-token',
            name: payload.name,
            token: userData.token
          }))
        } else {
          appendMessage('name already exists, and you have no auth token. try using a different name', true)
        }
      case 'auth-new':
        userData.name = payload.name
        userData.token = payload.token
        appendMessage('account created. logging in...', true)
        server.send(JSON.stringify({
          type: 'auth-recv'
        }))
        break
      case 'auth-ok':
        localStorage.setItem('name', userData.name)
        localStorage.setItem('token', userData.token)
        appendMessage(`logged in as <b style="color:${payload.nameColor}">${payload.name}</b>`, true)
        break
      case 'auth-fail':
        appendMessage(`login failed. if you believe this is an error, report it to lynn`, true)
        break
      case 'message':
        handleMessage(payload)
        break
      case 'command-color-ok':
        userData.color = payload.color
        localStorage.setItem('color', userData.color)
        appendMessage(`color changed to <b style="color:${userData.color}">${userData.color}</b>`, true)
        break
      case 'command-color-auth-required':
        appendMessage('only logged in users can use the /color command. use /name to log in', true)
        break
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

  /* auto-login */

  server.onopen = (event) => {
    if (userData.name !== undefined && userData.token !== undefined) {
      server.send(JSON.stringify({
        type: 'auth-token',
        name: userData.name,
        token: userData.token
      }))
    }
  }
})