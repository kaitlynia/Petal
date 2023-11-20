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
const validColor = s => {
  const style = new Option().style
  style.color = s
  return !['unset', 'initial', 'inherit', ''].includes(style.color)
}

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

let socks = Set()
wss.on('connection', sock => {
  socks.add(sock)
  sock.name = 'anon'
  sock.nameColor = '#aaaaaa'
  const send = payload => sock.send(JSON.stringify(payload))

  sock.on('message', msg => {
    console.log(JSON.parse(msg))
    const payload = JSON.parse(msg)

    if (payload.hasOwnProperty('type')) {
      switch (payload.type) {
        case 'auth-name':
          if (payload.name === 'anon' || data.nameToken[payload.name] !== undefined) {
            // name already exists, notify client
            send({
              type: 'auth-exists',
              name: payload.name
            })
          } else if (validName(payload.name)) {
            sock.auth_pair = {
              name: payload.name,
              token: crypto.randomUUID()
            }
            send({
              type: 'auth-new',
              name: payload.name,
              token: sock.auth_pair.token
            })
          } else {
            send({
              type: 'auth-name-invalid'
            })
          }
          break
        case 'auth-token':
          const names = data.tokenNames[payload.token]
          if (names !== undefined && names.includes(payload.name)) {
            sock.name = payload.name
            sock.nameColor = data.nameColor[payload.name] || '#aaaaaa'
            send({
              type: 'auth-ok',
              name: sock.name,
              nameColor: sock.nameColor
            })
          } else {
            send({
              type: 'auth-fail'
            })
          }
          break
        case 'auth-recv':
          if (sock.auth_pair !== undefined) {
            sock.name = sock.auth_pair.name
            data.names[sock.auth_pair.name] = sock.auth_pair.token
            sock.auth_pair = undefined

            saveData()
            send({
              type: 'auth-new-ok',
              name: sock.name
            })
          }
          break
        case 'priv-message':
          if (payload.hasOwnProperty('body') && payload.hasOwnProperty('name')) {
            const user = [...socks].find(s => s.name == payload.name)
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
          break
        case 'message':
          if (payload.hasOwnProperty('body')) {
            socks.forEach(s => s.send(JSON.stringify({
              type: 'message',
              name: sock.name,
              nameColor: sock.nameColor,
              body: sanitize(payload.body)
            })))
          }
          break
        case 'command-color':
          if (payload.hasOwnProperty('color')) {
            if (sock.name !== 'anon') {
              if (validColor(payload.color)) {
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
          break
      }
    }
  })
  sock.on('close', () => {
    socks.delete(sock)
  })
})

/*

client <auth-name> <name> -> server

server: '<name>' exists?

yes:
  server <auth-exists>
  client <auth-token> <name> <token>

  match:
    server <auth-ok> -> client
  invalid:
    server <auth-fail> -> client

no:
  server <auth-new> <token> -> client
  client <auth-recv> -> server
  !!! DON'T STORE NAME/TOKEN UNTIL AUTH-OK RECV !!!

  server data: {
    '<name>': '<token>'
  }

  server <auth-ok> -> client
  . now the data can be safely cached .
  client name '<name>' -> localStorage
  client token '<token>' -> localStorage




















*/