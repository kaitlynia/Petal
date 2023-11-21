const crypto = require('crypto')
const fs = require('fs')
const https = require('https')
const WSServer = require('ws').Server
const createDOMPurify = require('dompurify')
const JSDOM = require('jsdom').JSDOM

const window = new JSDOM('').window
const DOMPurify = createDOMPurify(window)
const https_key = fs.readFileSync('./privkey.pem', 'utf8')
const https_cert = fs.readFileSync('./fullchain.pem', 'utf8')
const https_server = https.createServer({ key: https_key, cert: https_cert })
const dataPath = './data.json'
https_server.listen(8080)

const wss = new WSServer({
  server: https_server
})

const sanitizeConfig = { ALLOWED_TAGS: ['span', 'strong', 'b', 'em', 'i'], ALLOWED_ATTR: [] }
const sanitize = s => DOMPurify.sanitize(s, sanitizeConfig)
const validName = s => !/[^0-9a-z]/i.test(s)
const validHexColor = s => /^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(s)

let data = {
  tokenNames: {},
  nameToken: {},
  nameColor: {},
  nameAvatar: {},
}

if (fs.existsSync(dataPath)) {
  data = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
}

const saveData = () => {
  fs.writeFileSync(dataPath, JSON.stringify(data))
}

const authToken = (sock, token, name, newName=false) => {
  const names = data.tokenNames[token]
  if (newName && names.length === 10) {
    sock.send(JSON.stringify({
      type: 'auth-fail-max-names'
    }))
  } else if (names !== undefined && (names.includes(name) || newName)) {
    sock.token = token
    sock.name = name
    sock.nameColor = data.nameColor[name] || '#aaaaaa'
    if (newName) {
      data.nameToken[name] = token
      names.push(sock.name)
      saveData()
    }
    sock.send(JSON.stringify({
      type: 'auth-ok',
      name: sock.name,
      nameColor: sock.nameColor
    }))
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
      send({
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
        send({
          type: 'auth-new',
          name: payload.name,
          token: sock.auth_pair.token
        })
      }
    } else {
      send({
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
      send({
        type: 'auth-new-ok',
        name: sock.name
      })
    } else {
      send({
        type: 'auth-fail-unknown'
      })
    }
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
          body: body
        }))
        send({
          type: 'priv-message-sent',
          name: payload.name,
          nameColor: sock.nameColor,
          body: body
        })
      } else {
        send({
          type: 'priv-message-fail',
          name: payload.name,
        })
      }
    }
  },
  'message': (sock, payload) => {
    if (payload.hasOwnProperty('body')) {
      socks.forEach(s => s.send(JSON.stringify({
        type: 'message',
        name: sock.name,
        nameColor: sock.nameColor,
        body: sanitize(payload.body)
      })))
    }
  },
  'command-names': (sock, payload) => {
    const names = data.tokenNames[payload.token]
    if (names !== undefined) {
      send({
        type: 'command-names-ok',
        names: names
      })
    } else {
      send({
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

          send({
            type: 'command-color-ok',
            color: sock.nameColor
          })
        } else {
          send({
            type: 'command-color-invalid'
          })
        }
      } else {
        send({
          type: 'command-color-auth-required'
        })
      }
    }
  }
}

let socks = new Set()
wss.on('connection', sock => {
  socks.add(sock)
  sock.name = 'anon'
  sock.nameColor = '#aaaaaa'
  const send = payload => sock.send(JSON.stringify(payload))

  sock.on('message', msg => {
    const payload = JSON.parse(msg)
    payloadHandlers[payload.type](sock, payload)
  })
  sock.on('close', () => {
    socks.delete(sock)
  })
})