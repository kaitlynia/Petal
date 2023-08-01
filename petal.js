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

  const appendMessage = (message, type) => {
    const scrollHeight = messages.scrollHeight

    messages.innerHTML += `<p class="msg${type != 'message' ? ' msg--' + type : ''}">${message}</p>`

    if (messages.clientHeight + messages.scrollTop + userData.scrollThreshold >= scrollHeight) {
      messages.scrollTop = messages.scrollHeight
    }
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

  const handleMessage = (payload) => {
    let cleanBody = cleanMessage(payload.body)

    if (cleanBody !== '') {
      switch (payload.type) {
        case 'message':
          appendMessage(`<b style="color:${payload.nameColor}">${payload.name}</b>: ${cleanBody}`, payload.type)
          break
        case 'priv-message':
          appendMessage(`⮜ <b style="color:${payload.nameColor}">${payload.name}</b>: ${cleanBody}`, payload.type)
          break
        case 'priv-message-sent':
          appendMessage(`⮞ <b>${payload.name}</b>: ${cleanBody}`, payload.type)
          break
      }
    }
  }

  const cleanURL = url => {
    url = url.replace('wss://', '').replace(':8080', '')
    return url.endsWith('/') ? url.slice(0, -1) : url
  }

  const setUserData = (key, val) => {
    userData[key] = val
    localStorage.setItem(key, val)
  }

  const events = {
    onerror: event => {
      if (userData.logConnectionEvents) {
        appendMessage(`failed to connect to ${cleanURL(server.url)}. use /server <url> to retry or connect to a new server`, 'system')
      }
    },
    onclose: event => {
      if (userData.logConnectionEvents) {
        appendMessage(`connection to ${cleanURL(server.url)} closed`, 'system')
      }
    },
    onopen: event => {
      if (userData.logConnectionEvents) {
        appendMessage(`connected to ${cleanURL(server.url)}`, 'system')
      }

      setUserData('server', server.url)

      if (userData.name !== undefined && userData.token !== undefined) {
        server.send(JSON.stringify({
          type: 'auth-token',
          name: userData.name,
          token: userData.token
        }))
      }
    },
    onmessage: event => {
      const payload = JSON.parse(event.data)

      switch (payload.type) {
        case 'auth-exists':
          if (userData.token !== undefined) {
            appendMessage('name already exists, attempting to log in using the stored token...', 'system')
            server.send(JSON.stringify({
              type: 'auth-token',
              name: payload.name,
              token: userData.token
            }))
          } else {
            appendMessage('name already exists, and you have no auth token. try using a different name', 'system')
          }
          break
        case 'auth-new':
          userData.name = payload.name
          userData.token = payload.token
          appendMessage('account created. logging in...', true)
          server.send(JSON.stringify({
            type: 'auth-recv'
          }))
          break
        case 'auth-new-ok':
          localStorage.setItem('name', userData.name)
          localStorage.setItem('token', userData.token)
          appendMessage(`logged in as <b>${payload.name}</b>`, 'system')
          break
        case 'auth-ok':
          appendMessage(`logged in as <b style="color:${payload.nameColor}">${payload.name}</b>`, 'system')
          break
        case 'auth-fail':
          appendMessage(`login failed. if you believe this is an error, report it to lynn`, 'system')
          break
        case 'priv-message':
          handleMessage(payload)
          break
        case 'priv-message-sent':
          setUserData('lastUserMessaged', payload.name)
          handleMessage(payload)
          break
        case 'priv-message-fail':
          appendMessage(`message could not be sent to <b>${payload.name}</b>. did they change their name?`, 'system')
          break
        case 'message':
          handleMessage(payload)
          break
        case 'command-color-ok':
          setUserData('color', payload.color)
          appendMessage(`color changed to <b style="color:${userData.color}">${userData.color}</b>`, 'system')
          break
        case 'command-color-auth-required':
          appendMessage('only logged in users can use the /color command. use /name to log in', 'system')
          break
      }
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

    console.log(url)

    if (userData.logConnectionEvents) {
      appendMessage(`connecting to ${cleanURL(url)}...`, 'system')
    }
    server = new WebSocket(url)
    Object.assign(server, events)
    return server
  }

  const commands = {
    server: (args) => {
      if (args) {
        if (server.hasOwnProperty('readyState')) {
          // connecting or open
          if (server.readyState <= 1) {
            server.onclose = event => {
              events.onclose(event)
              server = connect(args)
            }
            server.close()
          // closing
          } else if (server.readyState == 2) {
            server.onclose = event => {
              events.onclose(event)
              server = connect(args)
            }
          // closed
          } else {
            server = connect(args)
          }
        // unopened (first connection attempt)
        } else {
          server = connect(args)
        }
      } else {
        appendMessage('missing server url. example: /server example.com', 'system')
      }
    },
    help: () => {
      appendMessage(`commands: ${Object.keys(commands).join(', ')}`, 'system')
    },
    name: (args) => {
      if (args) {
        server.send(JSON.stringify({
          type: 'auth-name',
          name: sanitize(args)
        }))
      } else {
        appendMessage('missing name. example: /name cooluser23', 'system')
      }
    },
    color: (args) => {
      if (args) {
        server.send(JSON.stringify({
          type: 'command-color',
          color: sanitize(args)
        }))
      } else {
        appendMessage('missing color. examples: /color pink, /color #fffaaa, /color rgb(200, 200, 100)', 'system')
      }
    },
    w: (args) => {
      if (args) {
        const spaceIndex = args.search(' ')
        const body = args.slice(spaceIndex)
        if (spaceIndex != -1 && body.length > 0) {
          server.send(JSON.stringify({
            type: 'priv-message',
            name: sanitize(args.slice(0, spaceIndex)),
            body: sanitize(body),
          }))
        } else {
          appendMessage('missing message content. example: /w exampleUser23 hi!', 'system')
        }
      } else {
        appendMessage('missing name and message. example: /w exampleUser23 hi!', 'system')
      }
    },
    c: (args) => {
      if (userData.lastUserMessaged == undefined) {
        appendMessage('no previous recipient. example: /w exampleUser23 hi, /c hello again!', 'system')
      } else if (args && args.length > 1) {
        server.send(JSON.stringify({
          type: 'priv-message',
          name: sanitize(userData.lastUserMessaged),
          body: sanitize(args),
        }))
      } else {
        appendMessage('missing message. example: /w exampleUser23 hi, /c hello again!', 'system')
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
        appendMessage(`unknown command: ${cmd}`, 'system')
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
            server.send(JSON.stringify({
              type: 'message',
              body: cleanContents
            }))
          } catch (e) {
            console.log(e)
            appendMessage(`failed to send message. use /server ${userData.server} to reconnect or try to connect to a new server.`, 'system')
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
    appendMessage('welcome to Petal! use /server <url> to connect to a server.', 'system')
  }
})