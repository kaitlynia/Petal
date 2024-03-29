const crypto = require('crypto'),
fs = require('fs'),
https = require('https'),
WSServer = require('ws').Server,
createDOMPurify = require('dompurify'),
JSDOM = require('jsdom').JSDOM

const dataPath = './data.json',
maxMessageLength = 500

let data = {
  admins: [],
  cert: 'fullchain.pem',
  key: 'privkey.pem',
  port: 8080,
  tokenNames: {},
  nameToken: {},
  nameColor: {},
  nameTextColor: {},
  nameBgColor: {},
  nameAvatar: {},
  messageHistory: [],
  messageHistoryIndex: 0
}

const saveData = () => {
  fs.writeFileSync(dataPath, JSON.stringify(data))
}

if (fs.existsSync(dataPath)) {
  data = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
}

const window = new JSDOM('').window
const DOMPurify = createDOMPurify(window)
const https_server = https.createServer({
  cert: fs.readFileSync(data.cert),
  key: fs.readFileSync(data.key),
})
https_server.listen(data.port)

const wss = new WSServer({
  server: https_server
})

const sanitizeConfig = {
  ALLOWED_TAGS: ['a', 'b', 'i', 's', 'u', 'br'],
  ALLOWED_ATTR: ['href', 'target', 'rel']
},
sanitize = s => DOMPurify.sanitize(s, sanitizeConfig),
validName = s => !/[^0-9a-z]/i.test(s),
validHexColor = s => /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(s),

defaultNameColor = '#aaaaaa',
defaultTextColor = '#ffffff',
defaultBgColor = '#202020',
maxMessageHistory = 50

const sockSend = (sock, payload) => sock.send(JSON.stringify(payload))

const authToken = (sock, token, name, newName=false) => {
  const names = data.tokenNames[token]
  if (newName && names.length === 10) {
    sock.send(JSON.stringify({
      type: 'auth-fail-max-names'
    }))
  } else if (names !== undefined && (names.includes(name) || newName)) {
    const action = sock.name === 'anon' ? 'joined' : 'changed name to ' + name
    sock.token = token
    sock.name = name
    sock.nameColor = data.nameColor[name] || defaultNameColor
    sock.textColor = data.nameTextColor[name] || defaultTextColor
    sock.bgColor = data.nameBgColor[name] || defaultBgColor
    if (newName) {
      data.nameToken[name] = token
      names.push(sock.name)
      saveData()
    }
    sock.send(JSON.stringify({
      type: 'auth-ok',
      name: sock.name,
      nameColor: sock.nameColor,
      textColor: sock.textColor,
      bgColor: sock.bgColor,
      history: data.messageHistory.slice(data.messageHistoryIndex).concat(...data.messageHistory.slice(0, data.messageHistoryIndex)),
      participants: [...socks].map(s => s.name)
    }))
    updateParticipants(sock, action)
  } else {
    sock.send(JSON.stringify({
      type: 'auth-fail-unauthorized'
    }))
  }
}

const payloadHandlers = {
  'auth-name': (sock, payload) => {
    if (payload.name === 'anon' || data.nameToken[payload.name] !== undefined) {
      // name already exists, notify client
      sockSend(sock, {
        type: 'auth-exists',
        name: payload.name
      })
    } else if (validName(payload.name)) {
      if (sock.token !== undefined) {
        authToken(sock, sock.token, payload.name, true)
      } else {
        sock.auth_pair = {
          name: payload.name,
          token: crypto.randomUUID()
        }
        sockSend(sock, {
          type: 'auth-new',
          name: payload.name,
          token: sock.auth_pair.token
        })
      }
    } else {
      sockSend(sock, {
        type: 'auth-name-invalid'
      })
    }
  },
  'auth-token': (sock, payload) => {
    authToken(sock, payload.token, payload.name)
  },
  'auth-recv': (sock, payload) => {
    if (sock.auth_pair !== undefined) {
      sock.name = sock.auth_pair.name
      data.nameToken[sock.name] = sock.auth_pair.token
      data.tokenNames[sock.auth_pair.token] = [sock.name]
      delete sock.auth_pair
      saveData()

      sockSend(sock, {
        type: 'auth-new-ok',
        name: sock.name,
        history: data.messageHistory.slice(data.messageHistoryIndex).concat(...data.messageHistory.slice(0, data.messageHistoryIndex)),
        participants: [...socks].map(s => s.name)
      })
      updateParticipants(sock, 'joined as a new user (say hi!)')
    } else {
      sockSend(sock, {
        type: 'auth-fail-unknown'
      })
    }
  },
  'participants': (sock, payload) => {
    sockSend(sock, {
      type: 'participants-ok',
      participants: [...socks].map(s => s.name)
    })
  },
  'priv-message': (sock, payload) => {
    if (payload.hasOwnProperty('body') && payload.hasOwnProperty('name')) {
      const user = [...socks].find(s => s.name === payload.name)
      if (user !== undefined) {
        const body = sanitize(payload.body)
        user.send(JSON.stringify({
          type: 'priv-message',
          name: sock.name,
          nameColor: sock.nameColor,
          textColor: sock.textColor,
          bgColor: sock.bgColor,
          body: body
        }))
        sockSend(sock, {
          type: 'priv-message-sent',
          name: payload.name,
          nameColor: sock.nameColor,
          textColor: sock.textColor,
          bgColor: sock.bgColor,
          body: body
        })
      } else {
        sockSend(sock, {
          type: 'priv-message-fail',
          name: payload.name,
        })
      }
    }
  },
  'message': (sock, payload) => {
    if (payload.hasOwnProperty('body')) {
      const cleanBody = sanitize(payload.body)

      if (cleanBody.length > maxMessageLength) return

      const message = {
        type: 'message',
        hasAvatar: data.nameAvatar[sock.name] !== undefined,
        name: sock.name,
        nameColor: sock.nameColor,
        textColor: sock.textColor,
        bgColor: sock.bgColor,
        body: cleanBody
      }

      data.messageHistory[data.messageHistoryIndex] = message

      if (data.messageHistoryIndex + 1 >= maxMessageHistory) {
        data.messageHistoryIndex = 0
      } else {
        data.messageHistoryIndex += 1
      }
      saveData()

      const messageStr = JSON.stringify(message)

      socks.forEach(s => s.send(messageStr))
    }
  },
  'command-names': (sock, payload) => {
    const names = data.tokenNames[sock.token]
    if (names !== undefined) {
      sockSend(sock, {
        type: 'command-names-ok',
        names: names
      })
    } else {
      sockSend(sock, {
        type: 'command-names-fail'
      })
    }
  },
  'command-color': (sock, payload) => {
    if (payload.hasOwnProperty('color')) {
      if (sock.name !== 'anon') {
        if (validHexColor(payload.color)) {
          sock.nameColor = payload.color
          data.nameColor[sock.name] = sock.nameColor
          saveData()

          sockSend(sock, {
            type: 'command-color-ok',
            color: sock.nameColor
          })
        } else {
          sockSend(sock, {
            type: 'command-color-invalid'
          })
        }
      } else {
        sockSend(sock, {
          type: 'command-color-auth-required'
        })
      }
    }
  },
  'command-textcolor': (sock, payload) => {
    if (payload.hasOwnProperty('color')) {
      if (sock.name !== 'anon') {
        if (validHexColor(payload.color)) {
          sock.textColor = payload.color
          data.nameTextColor[sock.name] = sock.textColor
          saveData()

          sockSend(sock, {
            type: 'command-textcolor-ok',
            color: sock.textColor
          })
        } else {
          sockSend(sock, {
            type: 'command-color-invalid'
          })
        }
      } else {
        sockSend(sock, {
          type: 'command-color-auth-required'
        })
      }
    }
  },
  'command-bgcolor': (sock, payload) => {
    if (payload.hasOwnProperty('color')) {
      if (sock.name !== 'anon') {
        if (validHexColor(payload.color)) {
          sock.bgColor = payload.color
          data.nameBgColor[sock.name] = sock.bgColor
          saveData()

          sockSend(sock, {
            type: 'command-bgcolor-ok',
            color: sock.bgColor
          })
        } else {
          sockSend(sock, {
            type: 'command-color-invalid'
          })
        }
      } else {
        sockSend(sock, {
          type: 'command-color-auth-required'
        })
      }
    }
  },
  'avatar-upload': (sock, payload) => {
    if (sock.name !== 'anon') {
      fs.writeFile(`/var/www/html/avatars/${sock.name}.png`, payload.data.replace('data:image/png;base64,', ''), 'base64', err => {
        if (err) {
          sockSend(sock, {
            type: 'avatar-upload-fail',
            reason: err.toString()
          })
        } else {
          data.nameAvatar[sock.name] = true
          saveData()

          sockSend(sock, {
            type: 'avatar-upload-ok'
          })
        }
      })
    } else {
      sockSend(sock, {
        type: 'avatar-upload-auth-required'
      })
    }
  },
}

const socks = new Set()

const updateParticipants = (sock, action) => {
  const participantsStr = JSON.stringify({
    type: 'participants-update',
    name: sock.name,
    action: action
  });
  [...socks].filter(s => s.name !== sock.name).forEach(s => s.send(participantsStr))
}

wss.on('connection', sock => {
  socks.add(sock)
  sock.name = 'anon'
  sock.nameColor = defaultNameColor
  sock.textColor = defaultTextColor
  sock.bgColor = defaultBgColor

  sock.on('message', msg => {
    const payload = JSON.parse(msg)
    payloadHandlers[payload.type](sock, payload)
  })

  sock.on('close', () => {
    socks.delete(sock)
    if (sock.name !== 'anon') {
      updateParticipants(sock, 'left')
    }
  })
})