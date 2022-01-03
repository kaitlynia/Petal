require('dotenv').config()
const fs = require('fs')
const https = require('https')
const WSServer = require('ws').Server

const https_key = fs.readFileSync(process.env.HOST_LOCATION + 'privkey.pem', 'utf8')
const https_cert = fs.readFileSync(process.env.HOST_LOCATION + 'fullchain.pem', 'utf8')
const https_server_options = { key: https_key, certificate: https_cert }
const https_server = https.createServer(https_server_options)
https_server.listen(8080)

const wss = new WSServer({
  server: https_server  
})

let all = []
wss.on('connection', sock => {
  all.push(sock)
  sock.on('message', msg => {
    all.forEach(s => s.send(msg))
  })
  sock.on('close', () => {
    all = all.filter(s => s != sock)
  })
})