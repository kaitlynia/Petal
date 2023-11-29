document.addEventListener('DOMContentLoaded', () => {
  const rootURL = window.location.href.split('://', 2)[1].split('/', 2)[0]
  body = document.querySelector('body'),
  messages = document.querySelector('#messages'),
  entry = document.querySelector('#entry'),
  sanitize = s => DOMPurify.sanitize(s, sanitizeConfig),
  validName = s => !/[^0-9a-z]/i.test(s),
  validColor = s => {
    const style = new Option().style
    style.color = s
    return !['unset', 'initial', 'inherit', ''].includes(style.color)
  }

  let server = null,
  controlKeyHeld = false,
  lastMessageGroup = null,
  sanitizeConfig = { ALLOWED_TAGS: ['strong', 'b', 'em', 'i', 'br'], ALLOWED_ATTR: [] },
  userData = {
    server: localStorage.getItem('server') || undefined,
    token: localStorage.getItem('token') || undefined,
    name: localStorage.getItem('name') || undefined,
    color: localStorage.getItem('color') || undefined,
    lastUserPrivateMessaged: localStorage.getItem('lastUserPrivateMessaged') || undefined,
    theme: localStorage.getItem('theme') || 'dark',
    scrollThreshold: localStorage.getItem('scrollThreshold') || 50,
    logConnectionEvents: localStorage.getItem('logConnectionEvents') || true,
  },
  avatarImage = document.createElement('img'),
  avatarCanvas = document.createElement('canvas'),
  avatarInput = document.createElement('input')

  avatarCanvas.width = 256
  avatarCanvas.height = 256
  let avatarCanvasContext = avatarCanvas.getContext('2d')
  avatarInput.type = 'file'

  const setUserData = (key, val) => {
    userData[key] = val
    localStorage.setItem(key, val)
  }

  const tryScrollFrom = scrollHeight => {
    if (messages.clientHeight + messages.scrollTop + userData.scrollThreshold >= scrollHeight) {
      messages.scrollTop = messages.scrollHeight
    }
  }

  const addMessage = (text, modifier) => {
    const scrollHeight = messages.scrollHeight
    lastMessageGroup = null

    messages.innerHTML += `<div class="msg${modifier !== undefined ? ' msg--' + modifier : ''}">${text}</div>`

    tryScrollFrom(scrollHeight)
  }

  const addMessageGroup = (author, authorColor, messageText) => {
    const scrollHeight = messages.scrollHeight
    lastMessageGroup = author

    messages.innerHTML += `<div class="msg-group"><img class="avatar" src="${window.location.href + "/avatars/" + payload.name}.png"><div class="col"><div class="author" style="color: ${authorColor};">${author}</div><div class="msg">${messageText}</div></div>`

    tryScrollFrom(scrollHeight)
  }

  const addToLastMessageGroup = messageText => {
    const scrollHeight = messages.scrollHeight

    messages.querySelector('.msg-group:last-of-type > .col').innerHTML += `<div class="msg">${messageText}</div>`

    tryScrollFrom(scrollHeight)
  }

  const systemMessage = (message) => {
    addMessage(message, 'system')
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

    return sanitize(contents).trim().replace('\n', '<br>')
  }

  const cleanURL = url => {
    url = url.replace('wss://', '').replace(':8080', '')
    return url.endsWith('/') ? url.slice(0, -1) : url
  }

  const send = payload => server.send(JSON.stringify(payload))

  const payloadHandlers = {
    'auth-exists': payload => {
      if (userData.token !== undefined) {
        systemMessage('name already exists, attempting to log in using the stored token...')
        send({
          type: 'auth-token',
          name: payload.name,
          token: userData.token
        })
      } else {
        systemMessage('name already exists, and you have no stored token. try using a different name')
      }
    },
    'auth-name-invalid': payload => {
      systemMessage('invalid name. only letters and numbers are allowed.')
    },
    'auth-new': payload => {
      userData.name = payload.name
      userData.token = payload.token
      systemMessage('account created. logging in...')
      send({
        type: 'auth-recv'
      })
    },
    'auth-new-ok': payload => {
      setUserData('name', userData.name)
      setUserData('token', userData.token)
      systemMessage(`logged in as <b>${payload.name}</b>`)
    },
    'auth-ok': payload => {
      setUserData('name', payload.name)
      setUserData('color', payload.nameColor)
      systemMessage(`logged in as <b style="color:${payload.nameColor}">${payload.name}</b>`)
    },
    'auth-fail-max-names': payload => {
      systemMessage('you have reached the maximum number of names. (10)')
    },
    'auth-fail-unauthorized': payload => {
      systemMessage('not authorized. if you believe this is an error, please contact lynn')
    },
    'auth-fail-unknown': payload => {
      systemMessage(`login failed (reason: auth_pair missing). if you see this, please contact lynn with details`)
    },
    'priv-message': payload => {
      const cleanBody = sanitize(payload.body)
      if (cleanBody !== '') {
        addMessage(`← <b style="color:${payload.nameColor}">${payload.name}</b>: ${cleanBody}`, payload.type)
      }
    },
    'priv-message-sent': payload => {
      const cleanBody = sanitize(payload.body)
      if (cleanBody !== '') {
        setUserData('lastUserPrivateMessaged', payload.name)
        addMessage(`→ <b>${payload.name}</b>: ${cleanBody}`, payload.type)
      }
    },
    'priv-message-fail': payload => {
      systemMessage(`message could not be sent to <b>${payload.name}</b>. did they change their name?`)
    },
    'message': payload => {
      const cleanBody = sanitize(payload.body)
      if (cleanBody !== '') {
        if (lastMessageGroup === null || lastMessageGroup != payload.name) {
          addMessageGroup(payload.name, payload.nameColor, cleanBody)
        } else (
          addToLastMessageGroup(cleanBody)
        )
      }
    },
    'command-color-ok': payload => {
      setUserData('color', payload.color)
      systemMessage(`color changed to <b style="color:${userData.color}">${userData.color}</b>`)
    },
    'command-color-invalid': payload => {
      systemMessage('invalid hex color. examples: #ff9999 (pink), #007700 (dark green), #3333ff (blue)')
    },
    'command-color-auth-required': payload => {
      systemMessage('only logged in users can use the /color command. use /name to log in')
    },
    'command-names-ok': payload => {
      systemMessage(`names: ${payload.names.join(', ')}`)
    },
    'command-names-fail': payload => {
      systemMessage('you have no names. try /name <name>')
    },
    'avatar-upload-ok': payload => {
      systemMessage('avatar updated')
    },
    'avatar-upload-fail': payload => {
      systemMessage(`invalid avatar (reason: ${payload.reason}). if you are certain the image you uploaded is valid, please contact lynn with the specified error message`)
    },
    'avatar-upload-auth-required': payload => {
      systemMessage('only logged in users can upload an avatar. use /name to log in')
    }
  }

  const events = {
    onerror: event => {
      if (userData.logConnectionEvents) {
        systemMessage(`failed to connect to ${cleanURL(server.url)}. use /connect to retry or /connect <url>`)
      }
    },
    onclose: event => {
      if (userData.logConnectionEvents) {
        systemMessage(`connection to ${cleanURL(server.url)} closed`)
      }
    },
    onopen: event => {
      if (userData.logConnectionEvents) {
        systemMessage('connected')
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
    },
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
      systemMessage(`connecting to ${cleanURL(url)}...`)
    }
    server = new WebSocket(url)
    Object.assign(server, events)
    return server
  }

  const commands = {
    connect: args => {
      let dest = args
      if (!dest) {
        if (userData.server !== undefined) {
          dest = userData.server
        } else {
          return systemMessage(`missing server url. example: /connect ${rootURL}`)
        }
      }

      if (server && server.readyState < 3) {
        // connecting or open
        server.onclose = event => {
          events.onclose(event)
          server = connect(dest)
        }
        // close if not already closing
        if (server.readyState !== 2) {
          server.close()
        }
      // unopened or closed (!server || readyState === 3)
      } else {
        server = connect(dest)
      }
    },
    help: () => {
      systemMessage(`commands: ${Object.keys(commands).join(', ')}`)
    },
    name: args => {
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
          systemMessage(`your name is <b style="color:${userData.color}">${userData.name}</b>`)
        } else {
          systemMessage(`your name is <b>${userData.name}</b>`)
        }
      } else {
        systemMessage('you have the default name. use /name <name> to set one')
      }
    },
    names: args => {
      if (userData.token !== undefined) {
        send({
          type: 'command-names',
        })
      } else {
        payloadHandlers['command-names-fail']()
      }
    },
    color: args => {
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
        systemMessage(`your name color is <b style="color:${userData.color}">${userData.color}</b>`)
      } else {
        systemMessage('you have the default name color. use /color <color> to set one')
      }
    },
    avatar: args => {
      avatarInput.click()
    },
    w: args => {
      if (args) {
        const spaceIndex = args.search(' ')
        const body = args.slice(spaceIndex)
        if (spaceIndex !== -1 && body.length > 0) {
          send({
            type: 'priv-message',
            name: args.slice(0, spaceIndex),
            body: sanitize(body),
          })
        } else {
          systemMessage('missing message content. example: /w exampleUser23 hi!')
        }
      } else {
        systemMessage('missing name and message. example: /w exampleUser23 hi!')
      }
    },
    c: args => {
      if (userData.lastUserPrivateMessaged === undefined) {
        systemMessage('no previous recipient. example: /w exampleUser23 hi, /c hello again!')
      } else if (args && args.length > 1) {
        send({
          type: 'priv-message',
          name: userData.lastUserPrivateMessaged,
          body: sanitize(args),
        })
      } else {
        systemMessage('missing message. example: /w exampleUser23 hi, /c hello again!')
      }
    },
  }

  const tryCommand = (contents) => {
    if (contents.charAt(0) === '/') {
      const spaceIndex = contents.search(' ')
      const cmd = spaceIndex !== -1 ? contents.slice(1, spaceIndex) : contents.slice(1)
      if (commands.hasOwnProperty(cmd)) {
        commands[cmd](spaceIndex !== -1 ? contents.slice(spaceIndex + 1) : null)
      } else {
        systemMessage(`unknown command: ${cmd}`)
      }
      return true
    }
    return false
  }

  const processKeyboardEvent = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
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
            systemMessage('failed to send message. use /connect to reconnect or /connect <url>')
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

  avatarImage.addEventListener('load', event => {
    avatarCanvasContext.clearRect(0, 0, avatarCanvas.width, avatarCanvas.height);
    avatarCanvasContext.drawImage(avatarImage, 0, 0, avatarCanvas.width, avatarCanvas.height)

    send({
      type: 'avatar-upload',
      data: avatarCanvas.toDataURL('image/png')
    })
  })

  avatarInput.addEventListener('change', event => {
    avatarImage.src = URL.createObjectURL(avatarInput.files[0])
  })

  /* auto-connect */

  if (userData.server !== undefined) {
    server = connect(userData.server)
  } else {
    systemMessage(`welcome to Petal! use /connect <url> to connect to a server. (try ${rootURL})`)
  }
})