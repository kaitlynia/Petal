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
const https_server_options = { key: https_key, cert: https_cert }
const https_server = https.createServer(https_server_options)
const dataPath = './data.json'
https_server.listen(8080)

const wss = new WSServer({
  server: https_server
})

const sanitizeConfig = { ALLOWED_TAGS: ['span', 'strong', 'b', 'em', 'i'] }

let data = {'names': {}, 'nameColors': {}}

if (fs.existsSync(dataPath)) {
  data = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
}

const saveData = () => {
  fs.writeFileSync(dataPath, JSON.stringify(data))
}

let all = []
wss.on('connection', sock => {
  all.push(sock)
  sock.name = 'anon'

  sock.on('message', msg => {
    const payload = JSON.parse(msg)

    if (payload.hasOwnProperty('type')) {
      switch (payload.type) {
        case 'auth-name':
          if (payload.hasOwnProperty('name')) {
            const name = DOMPurify.sanitize(payload.name, sanitizeConfig)
            if (data.names.hasOwnProperty(name)) {
              // name already exists, notify client and optionally request an auth-token reply
              this.send(JSON.stringify({
                type: 'auth-exists',
                name: name
              }))
            } else {
              this.auth_pair = {
                name: payload.name,
                token: crypto.randomUUID()
              }
              this.send(JSON.stringify({
                type: 'auth-new',
                name: payload.name,
                token: this.auth_pair.token
              }))
            }
          }
          break
        case 'auth-token':
          if (payload.hasOwnProperty('name') && payload.hasOwnProperty('token')) {
            const name = DOMPurify.sanitize(payload.name, sanitizeConfig)
            if (data.names.hasOwnProperty(name)) {
              if (data.names[name] === payload.token) {
                this.name = name
                this.nameColor = data.nameColors[name] || '#aaaaaa'

                this.send(JSON.stringify({
                  type: 'auth-ok',
                  name: name
                }))
              } else {
                this.send(JSON.stringify({
                  type: 'auth-fail'
                }))
              }
            }
          }
          break
        case 'auth-recv':
          if (this.auth_pair !== undefined) {
            this.name = this.auth_pair.name
            data.names[this.auth_pair.name] = this.name
            this.auth_pair = undefined

            saveData()
            this.send(JSON.stringify({
              type: 'auth-ok'
            }))
          }
          break
        case 'message':
          if (payload.hasOwnProperty('body')) {
            all.forEach(s => s.send(JSON.stringify({
              type: 'message',
              name: this.name || 'anon',
              nameColor: this.nameColor || '#aaaaaa',
              body: DOMPurify.sanitize(payload.body, sanitizeConfig)
            })))
          }
          break
        case 'command-color':
          if (payload.hasOwnProperty('color')) {
            if (this.name !== undefined) {
              const color = DOMPurify.sanitize(payload.color, sanitizeConfig)
              data.nameColors[this.name] = color
              this.send(JSON.stringify({
                'type': 'command-color-ok',
                'color': color
              }))
            } else {
              this.send(JSON.stringify({
                'type': 'command-color-auth-required'
              }))
            }
          }
          break
      }
    }
  })
  sock.on('close', () => {
    all = all.filter(s => s != sock)
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