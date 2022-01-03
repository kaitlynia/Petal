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
https_server.listen(8080)

const wss = new WSServer({
  server: https_server  
})

let all = []
wss.on('connection', sock => {
  all.push(sock)
  sock.on('message', msg => {
    all.forEach(s => s.send(DOMPurify.sanitize(msg)))
  })
  sock.on('close', () => {
    all = all.filter(s => s != sock)
  })
})