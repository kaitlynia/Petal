document.addEventListener('DOMContentLoaded', () => {
  const body = document.querySelector('body'),
  messages = document.querySelector('#messages'),
  entry = document.querySelector('#entry'),
  sanitize = s => DOMPurify.sanitize(s, sanitizeConfig)

  let server = null,
  controlKeyHeld = false,
  sanitizeConfig = { ALLOWED_TAGS: ['span', 'strong', 'b', 'em', 'i'], ALLOWED_ATTR: [] },
  userData = {
    server: localStorage.getItem('server') || undefined,
    token: localStorage.getItem('token') || undefined,
    name: localStorage.getItem('name') || undefined,
    color: localStorage.getItem('color') || undefined,
    lastUserMessaged: localStorage.getItem('lastUserMessaged') || undefined,
    theme: localStorage.getItem('theme') || 'dark',
    scrollThreshold: localStorage.getItem('scrollThreshold') || 50,
    logConnectionEvents: localStorage.getItem('logConnectionEvents') || true,
  }

  const validName = s => !/[^0-9a-z]/i.test(s)
  const validColor = s => {
    const style = new Option().style
    style.color = s
    return !['unset', 'initial', 'inherit', ''].includes(style.color)
  }

  const appendMessage = (message, type='message') => {
    const scrollHeight = messages.scrollHeight

    messages.innerHTML += `<p class="msg${type !== 'message' ? ' msg--' + type : ''}">${message}</p>`

    if (messages.clientHeight + messages.scrollTop + userData.scrollThreshold >= scrollHeight) {
      messages.scrollTop = messages.scrollHeight
    }
  }

  const appendSystemMessage = (message) => {
    appendMessage(message, 'system')
  }

  const cleanMessage = (rawContents) => {
    let contents = rawContents

    if (contents instanceof Blob) {
      const reader = new FileReader()

      reader.onload = () => {
        contents = reader.result
      }

      reader.readAsText(contents)
    }

    return sanitize(contents).trim()
  }

  const cleanURL = url => {
    url = url.replace('wss://', '').replace(':8080', '')
    return url.endsWith('/') ? url.slice(0, -1) : url
  }

  const setUserData = (key, val) => {
    userData[key] = val
    localStorage.setItem(key, val)
  }

  const send = payload => server.send(JSON.stringify(payload))

  const payloadHandlers = {
    'auth-exists': payload => {
      if (userData.token !== undefined) {
        appendSystemMessage('name already exists, attempting to log in using the stored token...')
        send({
          type: 'auth-token',
          name: payload.name,
          token: userData.token
        })
      } else {
        appendSystemMessage('name already exists, and you have no auth token. try using a different name')
      }
    },
    'auth-name-invalid': payload => {
      appendSystemMessage('invalid name. only letters and numbers are allowed.')
    },
    'auth-new': payload => {
      userData.name = payload.name
      userData.token = payload.token
      appendSystemMessage('account created. logging in...')
      send({
        type: 'auth-recv'
      })
    },
    'auth-new-ok': payload => {
      localStorage.setItem('name', userData.name)
      localStorage.setItem('token', userData.token)
      appendSystemMessage(`logged in as <b>${payload.name}</b>`)
    },
    'auth-ok': payload => {
      appendSystemMessage(`logged in as <b style="color:${payload.nameColor}">${payload.name}</b>`)
    },
    'auth-fail': payload => {
      appendSystemMessage(`login failed. if you believe this is an error, report it to lynn`)
    },
    'priv-message': payload => {
      const cleanBody = sanitize(payload.body)
      if (cleanBody !== '') {
        appendMessage(`← <b style="color:${payload.nameColor}">${payload.name}</b>: ${cleanBody}`, payload.type)
      }
    },
    'priv-message-sent': payload => {
      setUserData('lastUserMessaged', payload.name)
      const cleanBody = sanitize(payload.body)
      if (cleanBody !== '') {
        appendMessage(`→ <b>${payload.name}</b>: ${cleanBody}`, payload.type)
      }
    },
    'priv-message-fail': payload => {
      appendSystemMessage(`message could not be sent to <b>${payload.name}</b>. did they change their name?`)
    },
    'message': payload => {
      setUserData('lastUserMessaged', payload.name)
      const cleanBody = sanitize(payload.body)
      if (cleanBody !== '') {
          appendMessage(`<b style="color:${payload.nameColor}">${payload.name}</b>: ${cleanBody}`, payload.type)
      }
    },
    'command-color-ok': payload => {
      setUserData('color', payload.color)
      appendSystemMessage(`color changed to <b style="color:${userData.color}">${userData.color}</b>`)
    },
    'command-color-invalid': payload => {
      appendSystemMessage('invalid color. examples: #ff9999, rgb(127, 127, 255), yellow')
    },
    'command-color-auth-required': payload => {
      appendSystemMessage('only logged in users can use the /color command. use /name to log in')
    },
  }

  const events = {
    onerror: event => {
      if (userData.logConnectionEvents) {
        appendSystemMessage(`failed to connect to ${cleanURL(server.url)}. use /connect to retry or /connect <url>`)
      }
    },
    onclose: event => {
      if (userData.logConnectionEvents) {
        appendSystemMessage(`connection to ${cleanURL(server.url)} closed`)
      }
    },
    onopen: event => {
      if (userData.logConnectionEvents) {
        appendSystemMessage(`connected to ${cleanURL(server.url)}`)
      }

      setUserData('server', server.url)

      if (userData.name !== undefined && userData.token !== undefined) {
        send({
          type: 'auth-token',
          name: userData.name,
          token: userData.token
        })
      }
    },
    onmessage: event => {
      const payload = JSON.parse(event.data)
      payloadHandlers[payload.type](payload)
    }
  }

  const connect = url => {
    url = 'wss://'.concat(url.replace('wss://', '').replace('ws://', ''))
    if (url.endsWith('/')) {
      url = url.slice(0, -1)
    }
    if (url.split(':').length <= 2) {
      url = url.concat(':8080')
    }

    if (userData.logConnectionEvents) {
      appendSystemMessage(`connecting to ${cleanURL(url)}...`)
    }
    server = new WebSocket(url)
    Object.assign(server, events)
    return server
  }

  const commands = {
    connect: (args) => {
      let dest = args
      if (!dest) {
        if (userData.server != undefined) {
          dest = userData.server
        } else {
          return appendSystemMessage('missing server url. example: /connect lynn.fun')
        }
      }

      if (server && server.readyState < 3) {
        // connecting or open
        server.onclose = event => {
          events.onclose(event)
          server = connect(dest)
        }
        // close if not already closing
        if (server.readyState != 2) {
          server.close()
        }
      // unopened or closed (!server || readyState == 3)
      } else {
        server = connect(dest)
      }
    },
    help: () => {
      appendSystemMessage(`commands: ${Object.keys(commands).join(', ')}`)
    },
    name: (args) => {
      if (args) {
        if (validName(args)) {
          send({
            type: 'auth-name',
            name: args
          })
        } else {
          payloadHandlers['auth-name-invalid']()
        }
      } else if (userData.name !== undefined) {
        if (userData.color !== undefined) {
          appendSystemMessage(`your name is <b style="color:${userData.color}">${userData.name}</b>`)
        } else {
          appendSystemMessage(`your name is <b>${userData.name}</b>`)
        }
      } else {
        appendSystemMessage('you have the default name. use /name <name> to set one')
      }
    },
    color: (args) => {
      if (args) {
        if (validColor(args)) {
          send({
            type: 'command-color',
            color: args
          })
        } else {
          payloadHandlers['command-color-invalid']()
        }
      } else if (userData.color !== undefined) {
        appendSystemMessage(`your name color is <b style="color:${userData.color}">${userData.color}</b>`)
      } else {
        appendSystemMessage('you have the default name color. use /color <color> to set one')
      }
    },
    w: (args) => {
      if (args) {
        const spaceIndex = args.search(' ')
        const body = args.slice(spaceIndex)
        if (spaceIndex != -1 && body.length > 0) {
          send({
            type: 'priv-message',
            name: args.slice(0, spaceIndex),
            body: sanitize(body),
          })
        } else {
          appendSystemMessage('missing message content. example: /w exampleUser23 hi!')
        }
      } else {
        appendSystemMessage('missing name and message. example: /w exampleUser23 hi!')
      }
    },
    c: (args) => {
      if (userData.lastUserMessaged == undefined) {
        appendSystemMessage('no previous recipient. example: /w exampleUser23 hi, /c hello again!')
      } else if (args && args.length > 1) {
        send({
          type: 'priv-message',
          name: userData.lastUserMessaged,
          body: sanitize(args),
        })
      } else {
        appendSystemMessage('missing message. example: /w exampleUser23 hi, /c hello again!')
      }
    }
  }

  const tryCommand = (contents) => {
    if (contents.charAt(0) === '/') {
      const spaceIndex = contents.search(' ')
      const cmd = spaceIndex != -1 ? contents.slice(1, spaceIndex) : contents.slice(1)
      if (commands.hasOwnProperty(cmd)) {
        commands[cmd](spaceIndex != -1 ? contents.slice(spaceIndex + 1) : null)
      } else {
        appendSystemMessage(`unknown command: ${cmd}`)
      }
      return true
    }
    return false
  }

  const processKeyboardEvent = (event) => {
    if (event.key == 'Enter' && !event.shiftKey) {
      // prevent newline character
      event.preventDefault()

      const cleanContents = cleanMessage(entry.value)

      if (cleanContents !== '') {
        // process entry contents
        const wasCommand = tryCommand(cleanContents)

        if (!wasCommand) {
          try {
            send({
              type: 'message',
              body: cleanContents
            })
          } catch (e) {
            console.log(e)
            appendSystemMessage('failed to send message. use /connect to reconnect or /connect <url>')
          }
        }
      }

      // clear text entry contents
      entry.value = ''

      // don't trigger this event twice
      event.stopPropagation()
    }
  }

  body.addEventListener('keydown', (event) => {
    if (event.key === 'Control') {
      controlKeyHeld = true
    } else if (!controlKeyHeld) {
      entry.focus()
      processKeyboardEvent(event)
    }
  })

  body.addEventListener('keyup', (event) => {
    if (event.key === 'Control') {
      controlKeyHeld = false
    }
  })

  entry.addEventListener('keydown', (event) => {
    processKeyboardEvent(event)
  })

  /* auto-connect */

  if (userData.server !== undefined) {
    server = connect(userData.server)
  } else {
    appendSystemMessage('welcome to Petal! use /connect <url> to connect to a server. (try lynn.fun!)')
  }
})